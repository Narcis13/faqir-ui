// Every element name the `unknown-element` audit rule accepts without a hyphen:
// each HTML element, current or obsolete-but-parsed, each SVG and each MathML
// element, lowercased. A custom element must contain a hyphen, so a name that is
// none of these and has none is almost always a typo — or, in output from a
// template language, a line of prose that lost its leading `|` (`<Open>the app
// now</Open>`). `packages/template/src/tags.js` holds the same list for the
// template compiler's `unknown-tag` diagnostic; a test keeps the two equal.

const HTML = "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select selectedcontent slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr";
const OBSOLETE = "acronym applet basefont bgsound big blink center dir font frame frameset image isindex keygen listing marquee menuitem multicol nextid nobr noembed noframes plaintext rb rtc spacer strike tt xmp";
const SVG = "animate animatemotion animatetransform circle clippath defs desc ellipse feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur feimage femerge femergenode femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence filter foreignobject g line lineargradient marker mask metadata mpath path pattern polygon polyline radialgradient rect set stop svg switch symbol text textpath tspan use view";
const MATHML = "annotation annotation-xml maction math menclose merror mfrac mi mlabeledtr mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics";

/** Every known element name, lowercased. */
export const KNOWN_ELEMENTS: ReadonlySet<string> = new Set(`${HTML} ${OBSOLETE} ${SVG} ${MATHML}`.split(" "));

/** True for a name an element may have: a known element (any case) or a custom element (with a hyphen). */
export function isKnownElement(tag: string): boolean {
  return tag.includes("-") || KNOWN_ELEMENTS.has(tag.toLowerCase());
}
