import Link from 'next/link';

export const metadata = { title: 'About · Studio Head Sim' };

export default function About() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-[#D8D3C8]">
      <Link href="/" className="link">← Back</Link>
      <h1 className="h-display mt-4 text-4xl font-bold text-[#F3EEDF]">About Studio Head Sim</h1>
      <p className="mt-4">You run a movie studio, starting in January 2026. Buy scripts, cast actors, greenlight films, fight rival studios for talent, release in cinemas and on streaming, chase awards, and try to keep your job. It is a sister game to T20 Franchise Sim.</p>

      <h2 className="mt-8 font-marquee text-2xl tracking-wider text-gold">Data &amp; attribution</h2>
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-panel p-4">
        <span className="rounded bg-[#0d253f] px-2 py-1 text-base font-bold text-[#01b4e4]">TMDB</span>
        <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
      </div>
      <p className="mt-3">Actor, director, writer and crew data (names, birth dates, filmographies, popularity) comes from <a className="link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">The Movie Database</a>. No TMDB images or actor photos are used anywhere in the game.</p>

      <h2 className="mt-8 font-marquee text-2xl tracking-wider text-gold">Disclaimer</h2>
      <p className="mt-3">Real names are used for simulation purposes only. Ratings are calculated from public filmography data and are not statements about any real person. Personality traits are assigned at random and imply nothing about real behaviour. Real people only ever receive neutral or positive in-game events; scandals and feuds happen only to fictional, generated characters.</p>
      <p className="mt-3">Studio names are used as plain text only, with no logos or brand imagery. Awards, festivals, critics and outlets are fictional. Scripts, titles and IP are generated.</p>
      <p className="mt-3">All simulation runs in your browser. There are no accounts; saves live in your browser&apos;s storage.</p>
    </div>
  );
}
