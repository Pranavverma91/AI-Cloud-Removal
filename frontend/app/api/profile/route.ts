import { identity, fail } from "@/lib/server";
export async function GET(req: Request) { try {
    const { name, email } = await identity(req);
    return Response.json({ name, email }, { headers: { "Cache-Control": "private, no-store" } });
}
catch (e) {
    return fail(e);
} }
