import { ArrowUpRight, Orbit } from "lucide-react";

export default function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return <header className="public-header">
    <a className="public-brand" href="/" aria-label="AI-Based Cloud Removal and Reconstruction home"><span className="brand-mark"><Orbit size={29} strokeWidth={1.4}/></span><span>AI-Based Cloud Removal and Reconstruction<small>EARTH. UNDERSTOOD.</small></span></a>
    <nav className="public-nav" aria-label="Main navigation"><a href="/">Overview</a><a href="/#observations">What you can analyze</a><a href="/#workflow">How it works</a></nav>
    <div className="public-auth">{signedIn ? <a className="btn btn-lime" href="/workspace">My workspace<ArrowUpRight size={16}/></a> : <><a className="public-login" href="/login">Log in</a><a className="btn btn-lime" href="/signup">Sign up<ArrowUpRight size={16}/></a></>}</div>
  </header>;
}
