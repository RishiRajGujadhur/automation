"""Make the README's short animated tour from the Playwright web screenshots."""

from pathlib import Path
from PIL import Image

screenshots = Path(__file__).resolve().parents[2] / "docs" / "screenshots"
names = (
    "web-dashboard.png",
    "web-feature-editor.png",
    "web-test-generator.png",
    "web-button-settings.png",
)
frames = []
for name in names:
    with Image.open(screenshots / name) as source:
        frame = source.convert("RGB").resize((960, 600), Image.Resampling.LANCZOS)
        frames.append(frame.quantize(colors=128, method=Image.Quantize.FASTOCTREE))

frames[0].save(
    screenshots / "web-workbench-tour.gif",
    save_all=True,
    append_images=frames[1:],
    duration=[1700, 2100, 2100, 2200],
    loop=0,
    optimize=True,
    disposal=2,
)
