/**
 * Typing for the one image we import through webpack instead of serving from
 * `public/`.
 *
 * Next generates `next-env.d.ts` (which declares `*.jpg` and friends) on the
 * first `next dev`/`next build`, but CI runs `tsc --noEmit` straight after
 * `npm install` with no build, so that file isn't there and the import fails to
 * typecheck. Declaring the exact path rather than the `*.jpg` wildcard keeps
 * this from colliding with Next's own declaration on machines that DO have
 * `next-env.d.ts` — TypeScript picks the more specific pattern, and two
 * wildcard declarations of the same module would clash on `default`.
 */
declare module "*/video-background.jpg" {
  const image: {
    src: string;
    height: number;
    width: number;
    blurDataURL?: string;
  };
  export default image;
}
