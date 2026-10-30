import torch
from torch import nn
from torch.nn import functional as F


class Residual(nn.Module):
    def __init__(self, incoming, outgoing):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv2d(incoming, outgoing, 3, padding=1),
            nn.GroupNorm(4, outgoing),
            nn.SiLU(),
            nn.Conv2d(outgoing, outgoing, 3, padding=1),
            nn.GroupNorm(4, outgoing),
        )
        self.skip = nn.Conv2d(incoming, outgoing, 1) if incoming != outgoing else nn.Identity()

    def forward(self, x):
        return F.silu(self.body(x) + self.skip(x))


class ResUNet(nn.Module):
    def __init__(self, incoming=4, base=16, outgoing=3):
        super().__init__()
        self.first, self.second, self.bottleneck = (
            Residual(incoming, base),
            Residual(base, base * 2),
            Residual(base * 2, base * 4),
        )
        self.up2, self.up1 = Residual(base * 6, base * 2), Residual(base * 3, base)
        self.output = nn.Conv2d(base, outgoing, 1)

    def forward(self, x):
        a = self.first(x)
        b = self.second(F.avg_pool2d(a, 2))
        c = self.bottleneck(F.avg_pool2d(b, 2))
        d = self.up2(
            torch.cat(
                [
                    F.interpolate(c, size=b.shape[-2:], mode="bilinear", align_corners=False),
                    b,
                ],
                1,
            )
        )
        e = self.up1(
            torch.cat(
                [
                    F.interpolate(d, size=a.shape[-2:], mode="bilinear", align_corners=False),
                    a,
                ],
                1,
            )
        )
        return self.output(e)


class PatchDiscriminator(nn.Module):
    def __init__(self, base=16):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv2d(7, base, 4, stride=2, padding=1),
            nn.LeakyReLU(0.2),
            nn.Conv2d(base, base * 2, 4, stride=2, padding=1),
            nn.GroupNorm(4, base * 2),
            nn.LeakyReLU(0.2),
            nn.Conv2d(base * 2, 1, 3, padding=1),
        )

    def forward(self, condition, estimate):
        return self.body(torch.cat([condition, estimate], 1))


class Denoiser(nn.Module):
    def __init__(self, base=16, multimodal=False):
        super().__init__()
        self.multimodal = multimodal
        if multimodal:
            self.optical = Residual(11, base)
            self.sar = Residual(2, base)
            self.attention = nn.MultiheadAttention(base, 4, batch_first=True)
            self.network = ResUNet(base * 2, base)
        else:
            self.network = ResUNet(8, base)

    def forward(self, noisy, time, condition):
        stamp = time[:, None, None, None].expand(-1, 1, noisy.shape[2], noisy.shape[3])
        if not self.multimodal:
            return self.network(torch.cat([noisy, condition, stamp], 1))
        optical = self.optical(torch.cat([noisy, condition[:, :7], stamp], 1))
        radar = self.sar(condition[:, 7:9])
        query = F.adaptive_avg_pool2d(optical, (8, 8)).flatten(2).transpose(1, 2)
        source = F.adaptive_avg_pool2d(radar, (8, 8)).flatten(2).transpose(1, 2)
        attended, _ = self.attention(query, source, source, need_weights=False)
        attended = attended.transpose(1, 2).reshape(noisy.shape[0], -1, 8, 8)
        attended = F.interpolate(
            attended, size=optical.shape[-2:], mode="bilinear", align_corners=False
        )
        return self.network(torch.cat([optical, attended], 1))


class ConditionalDDPM(nn.Module):
    def __init__(self, base=16, steps=100, multimodal=False):
        super().__init__()
        self.steps = steps
        self.denoiser = Denoiser(base, multimodal)
        beta = torch.linspace(1e-4, 0.02, steps)
        self.register_buffer("beta", beta)
        self.register_buffer("alpha", 1 - beta)
        self.register_buffer("alpha_bar", torch.cumprod(1 - beta, 0))

    def loss(self, condition, target, mask):
        t = torch.randint(self.steps, (target.shape[0],), device=target.device)
        noise = torch.randn_like(target)
        abar = self.alpha_bar[t, None, None, None]
        noisy = abar.sqrt() * target + (1 - abar).sqrt() * noise
        prediction = self.denoiser(noisy, t.float() / max(self.steps - 1, 1), condition)
        weights = 0.1 + mask
        return ((prediction - noise).square() * weights).sum() / (weights.sum() * 3)

    @torch.no_grad()
    def sample(self, condition):
        observed, mask = condition[:, :3], condition[:, 3:4]
        x = torch.randn_like(observed)
        for step in reversed(range(self.steps)):
            t = torch.full((x.shape[0],), step / max(self.steps - 1, 1), device=x.device)
            prediction = self.denoiser(x, t, condition)
            mean = (
                x - self.beta[step] / (1 - self.alpha_bar[step]).sqrt() * prediction
            ) / self.alpha[step].sqrt()
            if step:
                variance = (
                    self.beta[step] * (1 - self.alpha_bar[step - 1]) / (1 - self.alpha_bar[step])
                )
                x = mean + variance.sqrt() * torch.randn_like(x)
            else:
                x = mean
            x = x * mask + observed * (1 - mask)
        return x


def make_model(model_id, config):
    base = int(config.get("base", 16))
    if model_id in {"resunet", "cgan"}:
        return ResUNet(base=base)
    if model_id in {"diffusion", "multimodal-diffusion"}:
        return ConditionalDDPM(
            base, int(config.get("steps", 100)), model_id == "multimodal-diffusion"
        )
    raise ValueError("Unknown neural architecture")
