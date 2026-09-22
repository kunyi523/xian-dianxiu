#!/usr/bin/env python3
"""Chroma-key magenta JPEGs to transparent PNGs for game sprites."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path("/workspace/public/sprites")
OUT.mkdir(parents=True, exist_ok=True)


def chroma(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    arr = np.asarray(rgba).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx > 8, (mx - mn) / (mx + 1e-6), 0)
    # Magenta / hot pink: red and blue high, green low
    magenta = (r > 140) & (b > 140) & (g < r * 0.72) & (g < b * 0.85) & (sat > 0.18)
    # Near-white magenta JPEG fringe
    fringe = (r > 200) & (b > 180) & (g < 210) & (g + 25 < r) & (sat > 0.08)
    alpha = a.copy()
    alpha[magenta | fringe] = 0
    # Soft edge
    dist = np.clip((g - np.minimum(r, b) * 0.55) / 40, 0, 1)
    edge = (~(magenta | fringe)) & (r > 160) & (b > 140) & (sat > 0.12)
    alpha[edge] = (alpha[edge] * dist[edge]).astype(np.float32)
    arr[..., 3] = alpha
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim(img: Image.Image, pad: int = 8) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


def fit(img: Image.Image, w: int, h: int) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img = img.copy()
    img.thumbnail((w - 8, h - 8), Image.Resampling.LANCZOS)
    x = (w - img.width) // 2
    y = h - img.height - 4
    canvas.paste(img, (x, y), img)
    return canvas


PORTRAITS = {
    "disciple-outer": "/workspace/artifacts/imagine_images/aefc9773-ae12-495d-b7f7-b48f8004474c.jpg",
    "disciple-elder": "/workspace/artifacts/imagine_images/3462ac66-62eb-4e85-9ec2-634e9ce843c6.jpg",
    "disciple-sword": "/workspace/artifacts/imagine_images/a4dfa1bc-68f8-44b2-8755-3f41640f3289.jpg",
    "disciple-immortal": "/workspace/artifacts/imagine_images/67161303-cb9e-4701-a833-f3236ba9cb6c.jpg",
    "mascot": "/workspace/artifacts/imagine_images/915fdcf4-16b2-4067-b93b-6cb631f6fe53.jpg",
}

BUILDINGS = {
    "building-hall": "/workspace/artifacts/imagine_images/d395330c-9f3d-4393-b550-703c5f323511.jpg",
    "building-house": "/workspace/artifacts/imagine_images/c3098fcc-da90-48d8-a6a2-0af72be8817f.jpg",
    "building-sword": "/workspace/artifacts/imagine_images/42551872-2f58-4b73-b275-2210abfc4f8b.jpg",
    "building-array": "/workspace/artifacts/imagine_images/01578a7e-9f0e-4264-b7a5-5568c04c1526.jpg",
    "building-mine": "/workspace/artifacts/imagine_images/52cff102-91d8-4a5a-b3a9-64e8fcaaaeda.jpg",
    "building-tower": "/workspace/artifacts/imagine_images/3ab280e7-bb65-4a9e-81d9-ef04b396dd1f.jpg",
    "building-mirror": "/workspace/artifacts/imagine_images/713ff64d-a09d-4e05-929d-f24434ebcc8a.jpg",
    "building-alchemy": "/workspace/artifacts/imagine_images/0337e35d-c659-4d13-a1de-19259c34ed0a.jpg",
}


def run() -> None:
    for name, src in PORTRAITS.items():
        im = chroma(Image.open(src))
        im = trim(im, 12)
        fit(im, 192, 288).save(OUT / f"{name}.png")
        print("portrait", name, im.size)

    for name, src in BUILDINGS.items():
        im = chroma(Image.open(src))
        im = trim(im, 10)
        fit(im, 256, 256).save(OUT / f"{name}.png")
        print("building", name, im.size)

    icon = Image.open("/workspace/artifacts/imagine_images/e1ff49eb-893d-4da4-b4a6-1f6a9793d6fe.jpg").convert("RGBA")
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(OUT / "icon.png")
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(OUT / "icon-256.png")
    print("icon ok")


if __name__ == "__main__":
    run()
