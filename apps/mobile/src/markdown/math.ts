// Math without a math library: Hermes can't run KaTeX's DOM output, and a WebView per formula is too heavy for a
// question list. `$…$` and `$$…$$` are shown as monospace text, with the common LaTeX commands turned into the
// characters they stand for ("\frac{a}{b}" -> "(a)/(b)", "x^2" -> "x²", "\times" -> "×").

const symbols: Record<string, string> = {
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", equiv: "≡", infty: "∞", pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ",
  Delta: "Δ", lambda: "λ", mu: "μ", sigma: "σ", Sigma: "Σ", omega: "ω", Omega: "Ω", phi: "φ", rho: "ρ", tau: "τ",
  epsilon: "ε", sum: "Σ", prod: "Π", int: "∫", partial: "∂", nabla: "∇", rightarrow: "→", to: "→", leftarrow: "←",
  Rightarrow: "⇒", Leftrightarrow: "⇔", in: "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩", forall: "∀",
  exists: "∃", degree: "°", circ: "°", ldots: "…", cdots: "⋯", angle: "∠", perp: "⊥", parallel: "∥", therefore: "∴",
  neg: "¬", land: "∧", lor: "∨", left: "", right: "", quad: " ", qquad: "  ", ",": " ", ";": " ", " ": " ", "!": "",
};
const sup: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻",
  n: "ⁿ", i: "ⁱ", x: "ˣ",
};
const sub: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋",
  n: "ₙ", i: "ᵢ", x: "ₓ",
};

// The text of the braced group starting at `from` (which is the `{`), and where it ends.
function group(s: string, from: number): { text: string; end: number } {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return { text: s.slice(from + 1, i), end: i + 1 };
  }
  return { text: s.slice(from + 1), end: s.length };
}

const script = (map: Record<string, string>, text: string, mark: string) => {
  const chars = [...text];
  return chars.every((c) => map[c] !== undefined) ? chars.map((c) => map[c]).join("") : chars.length === 1 ? `${mark}${text}` : `${mark}(${text})`;
};

export function texToText(tex: string): string {
  let out = "";
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]!;
    if (c === "\\") {
      const name = /^[A-Za-z]+/.exec(tex.slice(i + 1))?.[0] ?? tex[i + 1] ?? "";
      i += name.length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const top = group(tex, i + 1);
        const bottom = group(tex, top.end);
        out += `(${texToText(top.text)})/(${texToText(bottom.text)})`;
        i = bottom.end - 1;
      } else if (name === "sqrt") {
        const arg = group(tex, i + 1);
        out += `√(${texToText(arg.text)})`;
        i = arg.end - 1;
      } else if (name === "text" || name === "mathrm" || name === "textbf" || name === "mathbf" || name === "operatorname") {
        const arg = group(tex, i + 1);
        out += arg.text;
        i = arg.end - 1;
      } else out += symbols[name] ?? name;
    } else if (c === "^" || c === "_") {
      const map = c === "^" ? sup : sub;
      if (tex[i + 1] === "{") {
        const arg = group(tex, i + 1);
        out += script(map, texToText(arg.text), c);
        i = arg.end - 1;
      } else {
        out += script(map, tex[i + 1] ?? "", c);
        i += 1;
      }
    } else if (c === "{" || c === "}") continue;
    else out += c;
  }
  return out;
}
