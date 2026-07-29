import { useState } from "react";
import logoAsset from "@/assets/mimony-logo.png.asset.json";

/**
 * The sidebar/header logo.
 *
 * The logo is the one image in the app that isn't a bundled asset — it's referenced by absolute URL
 * (`/__l5e/assets-v1/…`) from an asset manifest, and that path only resolves inside the Lovable
 * preview host. On any other deployment the request 404s and the browser paints its broken-image
 * icon, which is what was reported. Everything else under src/assets is a real import and is fine.
 *
 * So: still try the hosted image (it's correct where it resolves), but fall back to a drawn wordmark
 * the moment it fails, so no deployment ever shows a broken image. Drop a real file at
 * `public/logo.png` and it takes priority over both.
 */
export function BrandLogo({ className = "h-6 w-auto" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-display font-bold leading-none tracking-tight text-brand ${className}`}
        aria-label="Mi Money"
      >
        <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-brand text-[11px] font-bold text-brand-foreground">
          M
        </span>
        <span className="text-[13px]">MiMoney</span>
      </span>
    );
  }

  return (
    <img src={logoAsset.url} alt="Mi Money" className={className} onError={() => setFailed(true)} />
  );
}
