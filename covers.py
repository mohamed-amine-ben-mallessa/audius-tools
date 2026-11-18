"""Square cover art for Audius tracks, in a cut-paper collage style (ransom-letter title, tape banner, character + prop).

    pip install playwright pillow && python -m playwright install chromium     # once
    python covers.py covers.json [--out covers/] [--only <trackId>]

covers.json (paths are relative to the JSON file):
{
  "size": 1400,
  "header": "WHAT IF…",                       # small line at the top ("" to hide)
  "tape": "LOOPHAVEN × REAPER",               # text of the tape banner ("" to hide)
  "fonts": {"title": "fonts/x.ttf", "mono": "fonts/y.ttf"},   # optional: without it, Montserrat + Space Mono (Google Fonts)
  "backgrounds": {"cream": "bg/cream.webp", "kraft": "bg/kraft.webp", "navy": "bg/navy.webp"},
  "dark": ["navy"],                           # backgrounds that need light text
  "tiles": ["#E0402F", "#F2EFE6", "#14183A", "#F2B63C", "#2A9D8F"],
  "tracks": [
    {"id": "mEd4Omy", "title": "TRAP 150", "subtitle": "TWO WORDS", "hero": "img/pose.webp", "prop": "img/gamepad.webp",
     "bg": "cream", "tape_color": "#F2B63C", "footer": "produced in REAPER"}
  ]
}
"hero" = a tall transparent cutout (shown waist-up, cropped under the banner); "prop" = a smaller transparent object (optional).
Output: <out>/<id>.jpg (JPEG 92) + <out>/planche.jpg (contact sheet). Then: node audius.mjs artwork --track <id> --cover <out>/<id>.jpg
"""
import argparse, asyncio, html as H, json, pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

ap = argparse.ArgumentParser()
ap.add_argument('config'); ap.add_argument('--out', default='covers'); ap.add_argument('--only')
a = ap.parse_args()
CFG = pathlib.Path(a.config).resolve(); BASE = CFG.parent
cfg = json.loads(CFG.read_text(encoding='utf-8'))
OUT = pathlib.Path(a.out).resolve()
U = lambda p: (BASE / p).resolve().as_uri()
SIZE = cfg.get('size', 1400); K = SIZE / 1400                      # layout is designed on a 1400 grid
TILES = cfg.get('tiles', ['#E0402F', '#F2EFE6', '#14183A', '#F2B63C', '#2A9D8F'])
LIGHT_TILES = {t for t in TILES if t.upper() in ('#F2EFE6', '#F2B63C', '#EFE6D0')}


def ransom(text, size):
    words, i = [], 0
    for w in text.split():
        out = []
        for ch in w:
            bg = TILES[(i * 3 + len(text)) % len(TILES)]; ink = '#14183A' if bg in LIGHT_TILES else '#F2EFE6'
            out.append(f'<span class="t" style="background:{bg};color:{ink};font-size:{size}px;transform:rotate({((i * 37) % 9 - 4) * .9}deg)">{H.escape(ch)}</span>'); i += 1
        words.append('<span class="w">' + ''.join(out) + '</span>')
    return ''.join(words)


def page(t):
    FONTS = (f"@font-face{{font-family:M;src:url('{U(cfg['fonts']['title'])}')}} @font-face{{font-family:Mo;src:url('{U(cfg['fonts']['mono'])}')}}"
             if cfg.get('fonts') else "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;900&family=Space+Mono:wght@400;700&display=swap'); "
             "")
    dark = t.get('bg') in cfg.get('dark', ['navy'])
    long_ = len(t['title']) > 8
    tsize = (150 if not long_ else 112) * K
    ttop = (930 if not long_ else 790) * K; stop = 1150 * K; hb = ttop - 245 * K
    tape = t.get('tape_color', '#F2B63C'); ink = '#EFE6D0' if dark else '#14183A'
    prop = f'<img class="prop" src="{U(t["prop"])}">' if t.get('prop') else ''
    html_ = f"""<!doctype html><html><head><meta charset="utf-8"><style>
{FONTS}
*{{margin:0;box-sizing:border-box}}
body{{width:{SIZE}px;height:{SIZE}px;background:url('{U(cfg['backgrounds'][t.get('bg', 'cream')])}') center/cover;position:relative;overflow:hidden;font-family:M}}
.vig{{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,transparent 45%,rgba(0,0,0,{.45 if dark else .22}) 100%)}}
.top{{position:absolute;top:{58 * K}px;width:100%;text-align:center;font:600 {34 * K}px Mo;letter-spacing:{14 * K}px;color:{ink};opacity:.75}}
.tape{{position:absolute;top:{122 * K}px;left:50%;transform:translateX(-50%) rotate(-2.5deg);background:{tape};padding:{14 * K}px {60 * K}px;
  font:700 {40 * K}px Mo;letter-spacing:{6 * K}px;color:{'#14183A' if tape.upper() != '#E0402F' else '#F2EFE6'};clip-path:polygon(2% 0,100% 6%,98% 100%,0 92%);z-index:2}}
.hbox{{position:absolute;left:0;right:0;top:{215 * K}px;height:{hb}px;overflow:hidden}}
.hero{{position:absolute;left:{40 if prop else 50}%;top:0;transform:translateX(-50%);height:{hb * 1.62}px;filter:drop-shadow(8px 14px 14px rgba(0,0,0,.35))}}
.prop{{position:absolute;left:76%;top:{215 * K + hb * .62}px;transform:translate(-50%,-50%) rotate(6deg);height:{hb * .48}px;max-width:{380 * K}px;object-fit:contain;filter:drop-shadow(8px 12px 12px rgba(0,0,0,.35))}}
.title{{position:absolute;top:{ttop}px;width:100%;display:flex;justify-content:center;flex-wrap:wrap;gap:{22 * K}px {40 * K}px;padding:0 {50 * K}px}}
.w{{display:inline-flex;gap:{8 * K}px;white-space:nowrap}}
.t{{display:inline-block;font-weight:900;line-height:1;padding:{10 * K}px {16 * K}px {8 * K}px;box-shadow:4px 6px 0 rgba(0,0,0,.25)}}
.sub{{position:absolute;top:{stop}px;left:50%;transform:translateX(-50%) rotate(1.2deg);background:#EFE6D0;color:#14183A;padding:{12 * K}px {40 * K}px;
  font:900 {66 * K}px M;letter-spacing:{4 * K}px;white-space:nowrap;box-shadow:5px 7px 0 rgba(0,0,0,.25)}}
.feat{{position:absolute;bottom:{58 * K}px;width:100%;text-align:center;font:600 {34 * K}px Mo;letter-spacing:{4 * K}px;color:{ink}}}
</style></head><body><div class="vig"></div>
{f'<div class="top">{H.escape(cfg["header"])}</div>' if cfg.get('header') else ''}
{f'<div class="tape">{H.escape(cfg["tape"])}</div>' if cfg.get('tape') else ''}
<div class="hbox"><img class="hero" src="{U(t['hero'])}"></div>{prop}
<div class="title">{ransom(t['title'], tsize)}</div>
{f'<div class="sub">{H.escape(t["subtitle"])}</div>' if t.get('subtitle') else ''}
<div class="feat">{H.escape(t.get('footer', ''))}</div></body></html>"""
    if not cfg.get('fonts'):                     # Google Fonts: use the real family names instead of the M / Mo aliases
        import re
        html_ = re.sub(r"(px )Mo\b", r"\1'Space Mono',monospace", html_)
        html_ = re.sub(r"(px )M\b", r"\1'Montserrat',sans-serif", html_)
        html_ = html_.replace('font-family:M}', "font-family:'Montserrat',sans-serif}")
    return html_


async def main():
    from playwright.async_api import async_playwright
    OUT.mkdir(parents=True, exist_ok=True)
    tracks = [t for t in cfg['tracks'] if not a.only or t['id'] == a.only]
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': SIZE, 'height': SIZE})
        for t in tracks:
            f = OUT / f"_{t['id']}.html"; f.write_text(page(t), encoding='utf-8')
            await pg.goto(f.as_uri()); await pg.wait_for_timeout(400)
            await pg.screenshot(path=str(OUT / f"{t['id']}.jpg"), type='jpeg', quality=92); f.unlink()
            print('cover →', OUT / f"{t['id']}.jpg")
        await b.close()
    from PIL import Image
    ims = [Image.open(OUT / f"{t['id']}.jpg").resize((460, 460)) for t in tracks]
    cols = min(4, len(ims)); rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 470 + 10, rows * 470 + 10), '#777')
    for i, im in enumerate(ims): sheet.paste(im, (10 + (i % cols) * 470, 10 + (i // cols) * 470))
    sheet.save(OUT / 'planche.jpg', quality=88); print('planche →', OUT / 'planche.jpg')

asyncio.run(main())
