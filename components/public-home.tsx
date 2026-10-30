import { ArrowUpRight, ArrowRight, Sprout, Droplets, Trees, MapPin, CalendarDays, ScanLine, ShieldCheck, Orbit } from "lucide-react";
import PublicHeader from "./public-header";
import OrbitHero from "./orbit-hero";

export default function PublicHome({ signedIn }: { signedIn: boolean }) {
  const destination = (view: string) => signedIn ? `/workspace?view=${view}` : `/signup?return_to=${encodeURIComponent(`/workspace?view=${view}`)}`;
  return <div className="home-page">
    <PublicHeader signedIn={signedIn}/>
    <main>
      <div className="home-hero"><OrbitHero signedIn={signedIn}/></div>
      <div className="home-source"><span><Orbit size={16}/>COPERNICUS SENTINEL-2</span><p>Real captures, with the date behind every image.</p><span><ShieldCheck size={16}/>YOUR PRIVATE WORKSPACE</span></div>
      <section className="home-observations" id="observations" aria-labelledby="observe-heading">
        <div className="home-section-heading"><span className="eyebrow">A CLOSER LOOK AT EARTH</span><h2 id="observe-heading">What will you discover?</h2><p>Start with a place you know. See what the satellite sees.</p></div>
        <div className="home-tools">
          <a className="home-tool agriculture" href={destination("agriculture")}><span className="home-tool-top"><Sprout/><span>01 / CROPS</span><ArrowUpRight/></span><h3>Read the landscape.</h3><p>Explore vegetation signals and compare the original capture with its measured result.</p><span className="home-tool-link">Explore crop health<ArrowRight size={16}/></span></a>
          <a className="home-tool water" href={destination("water")}><span className="home-tool-top"><Droplets/><span>02 / WATER</span><ArrowUpRight/></span><h3>Follow the water.</h3><p>Find water signals around rivers, lakes, and the places that matter to you.</p><span className="home-tool-link">Explore water detection<ArrowRight size={16}/></span></a>
          <a className="home-tool forest" href={destination("forest")}><span className="home-tool-top"><Trees/><span>03 / FORESTS</span><ArrowUpRight/></span><h3>See what changes.</h3><p>Compare two capture dates to understand where vegetation has increased or decreased.</p><span className="home-tool-link">Explore forest change<ArrowRight size={16}/></span></a>
        </div>
      </section>
      <section className="home-workflow" id="workflow" aria-labelledby="workflow-heading">
        <div><span className="eyebrow">FROM ORBIT TO OBSERVATION</span><h2 id="workflow-heading">Your next perspective<br/>starts with a place.</h2><a className="btn btn-lime" href={signedIn ? "/workspace" : "/signup"}>{signedIn ? "Open workspace" : "Create your account"}<ArrowUpRight size={16}/></a></div>
        <ol><li><MapPin/><div><h3>Find your place</h3><p>Search a town, river, or forest, then select your area on the named map.</p></div></li><li><CalendarDays/><div><h3>Choose a capture</h3><p>Review available acquisition dates and cloud cover before you analyze.</p></div></li><li><ScanLine/><div><h3>Make an observation</h3><p>Compare images, inspect measurements, and save your report in your account.</p></div></li></ol>
      </section>
      <p className="home-data-note">Satellite imagery becomes available after each capture is processed. Cloud cover and satellite passes determine how recent an image is.</p>
    </main>
    <footer className="public-footer"><a href="/">AI-Based Cloud Removal and Reconstruction</a><span>A new perspective on your world.</span><span>Copernicus imagery · NASA 3D model</span></footer>
  </div>;
}
