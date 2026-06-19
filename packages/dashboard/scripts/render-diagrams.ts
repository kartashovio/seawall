// One-off: render the two presentational dashboard diagrams (ArchitectureDiagram,
// ModelDiagram) to STANDALONE .svg files for the README + docs. Both components use
// inline color attributes (no CSS classes), so the output is self-contained — the only
// CSS dependency is the font CSS-vars, which we strip here so the fallback font chain
// applies in a standalone context. Run:
//   pnpm --filter @seawall/dashboard exec tsx scripts/render-diagrams.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ArchitectureDiagram } from "../src/components/ArchitectureDiagram";
import { ModelDiagram } from "../src/components/ModelDiagram";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../../docs/assets");
mkdirSync(outDir, { recursive: true });

function emit(node: ReturnType<typeof createElement>, file: string, w: number, h: number) {
  let svg = renderToStaticMarkup(node);
  // standalone namespace (React may omit it)
  if (!svg.includes("xmlns=")) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // CSS vars are invalid inside SVG presentation attributes standalone → drop the
  // var() prefix so the explicit fallback families (system-ui / ui-monospace …) win.
  svg = svg.split("var(--font-ui), ").join("").split("var(--font-mono), ").join("");
  // give the file a concrete intrinsic size (the viewBox keeps the aspect ratio)
  svg = svg.replace('width="100%"', `width="${w}" height="${h}"`);
  const path = resolve(outDir, file);
  writeFileSync(path, '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + "\n");
  console.log("wrote", path, `(${w}x${h})`);
}

emit(createElement(ArchitectureDiagram), "architecture-diagram.svg", 1200, 600);
emit(createElement(ModelDiagram), "model-diagram.svg", 1200, 700);
