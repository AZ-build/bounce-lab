"""Bounce Lab: draw a home-screen icon for every game.

Each icon uses the lab's look (dark concrete wall, steel, neon) with the game's
own neon colour and one signature element:
  side  (Bouncer)   two steel platforms and a bounce trail
  goal  (Smashball) a neon goal with the orb hitting the net
  up    (Ascent)    a curved pad launching the orb up past chevrons
  peak  (Summit)    a boulder on a mountain ridge below a gold summit light
Anything else gets the lab orb in the game's colour.

For each game in games.js this writes, inside games/<id>/:
  icons/icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
  manifest.webmanifest   (so "Add to Home Screen" saves the game, not the lobby)
and points the <head> of games/<id>/index.html at them.

Run from the repo root (needs Python 3 and rsvg-convert):
    python3 tools/make_game_icons.py
"""
import json, math, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICON_V = 4  # bump when the icons change, so phones fetch the new ones (also ICON_V in index.html)

# ---------------------------------------------------------------- shared parts

def defs(c, light):
    return f'''
 <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0"/></filter>
 <filter id="blotch" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter>
 <filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
 <filter id="b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
 <filter id="b6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
 <filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
 <filter id="b14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
 <filter id="b18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
 <filter id="b30" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="30"/></filter>
 <filter id="rock" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="4" seed="21"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 .75"/></filter>
 <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050507"/><stop offset=".55" stop-color="#101116"/><stop offset="1" stop-color="#16171c"/></linearGradient>
 <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4d535c"/><stop offset=".5" stop-color="#2b2f36"/><stop offset="1" stop-color="#16181c"/></linearGradient>
 <linearGradient id="steelDn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16181c"/><stop offset=".5" stop-color="#2b2f36"/><stop offset="1" stop-color="#5a616b"/></linearGradient>
 <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b727c"/><stop offset=".2" stop-color="#25282e"/><stop offset="1" stop-color="#0d0e11"/></linearGradient>
 <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1013"/><stop offset="1" stop-color="#030304"/></linearGradient>
 <radialGradient id="spec" cx="0" cy="0" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'''


def wall(c, glow_xy=(256, 230), glow_r=200, glow_a=.13):
    """Concrete panel wall with seams and bolts, plus a soft colour wash from the subject."""
    gx, gy = glow_xy
    bolts = ''.join(
        f'<circle cx="{x}" cy="{y}" r="4" fill="#000" opacity=".75"/>'
        f'<path d="M{x-4.5} {y+1} A4.5 4.5 0 0 0 {x+4.5} {y+1}" stroke="#fff" stroke-opacity=".08" fill="none"/>'
        for x in (64, 192, 320, 448) for y in (90, 250))
    return f'''
 <rect width="512" height="512" fill="url(#wall)"/>
 <rect width="512" height="512" filter="url(#blotch)"/>
 <rect width="512" height="512" filter="url(#grain)"/>
 <path d="M128 -200V712M384 -200V712M-200 170H712" stroke="#000" stroke-opacity=".85" stroke-width="4"/>
 <path d="M131 -200V712M387 -200V712M-200 173H712" stroke="#fff" stroke-opacity=".05" stroke-width="1.5"/>
 {bolts}
 <circle cx="{gx}" cy="{gy}" r="{glow_r}" fill="{c}" opacity="{glow_a}" filter="url(#b30)"/>'''


def floor(c, light, y=366):
    """Neon strip where wall meets floor, then a steel track with a lit channel."""
    return f'''
 <rect x="-200" y="{y-36}" width="912" height="40" fill="{c}" opacity=".12" filter="url(#b18)"/>
 <rect x="-200" y="{y-2}" width="912" height="5" fill="{c}" filter="url(#b3)"/>
 <rect x="-200" y="{y-0.5}" width="912" height="2" fill="{light}"/>
 <rect x="-200" y="{y+3}" width="912" height="400" fill="url(#floor)"/>
 <rect x="-200" y="{y+18}" width="912" height="52" fill="url(#steel)"/>
 <rect x="-200" y="{y+18}" width="912" height="52" filter="url(#grain)" opacity=".8"/>
 <path d="M150 {y+18} L128 {y+70} M360 {y+18} L382 {y+70}" stroke="#000" stroke-opacity=".85" stroke-width="3"/>
 <rect x="-200" y="{y+70}" width="912" height="18" fill="url(#lip)"/>
 <rect x="-200" y="{y+70}" width="912" height="1.5" fill="#fff" opacity=".4"/>
 <rect x="-200" y="{y+77}" width="912" height="4" fill="#050506"/>
 <rect x="-200" y="{y+77.5}" width="912" height="3" fill="{c}" filter="url(#b3)"/>
 <rect x="-200" y="{y+78.3}" width="912" height="1.4" fill="{light}"/>'''


def neon_path(d, c, light, core='#fff', w=6, extra=''):
    """A glowing tube: wide blur, colour, bright core."""
    return f'''
 <path d="{d}" fill="none" stroke="{c}" stroke-width="{w*3}" stroke-linecap="round" stroke-linejoin="round" opacity=".55" filter="url(#b14)" {extra}/>
 <path d="{d}" fill="none" stroke="{c}" stroke-width="{w*1.4}" stroke-linecap="round" stroke-linejoin="round" filter="url(#b3)" {extra}/>
 <path d="{d}" fill="none" stroke="{light}" stroke-width="{w*.8}" stroke-linecap="round" stroke-linejoin="round" {extra}/>
 <path d="{d}" fill="none" stroke="{core}" stroke-width="{max(1.2, w*.3)}" stroke-linecap="round" stroke-linejoin="round" opacity=".9" {extra}/>'''


def seam_paths(cx, cy, r, yaw, pitch, roll, b=.27):
    """Tennis-ball seam on a sphere, rotated, projected; only the half facing us."""
    a = 1 - b
    k = 2 * math.sqrt(a * b)
    cyw, syw = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)
    segs, cur = [], []
    N = 400
    for i in range(N + 1):
        t = 2 * math.pi * i / N
        x = a * math.cos(t) + b * math.cos(3 * t)
        y = a * math.sin(t) - b * math.sin(3 * t)
        z = k * math.sin(2 * t)
        x, z = x * cyw + z * syw, -x * syw + z * cyw          # yaw (around y)
        y, z = y * cp - z * sp, y * sp + z * cp                # pitch (around x)
        x, y = x * cr - y * sr, x * sr + y * cr                # roll (around z)
        if z > 0.02:
            cur.append((cx + x * r, cy + y * r))
        elif cur:
            segs.append(cur); cur = []
    if cur:
        if segs and abs(segs[0][0][0] - cur[-1][0]) < 3 and abs(segs[0][0][1] - cur[-1][1]) < 3:
            segs[0] = cur + segs[0]
        else:
            segs.append(cur)
    return ['M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in s) for s in segs if len(s) > 3]


def orb(uid, cx, cy, r, c, light, core, rot=(0.5, -0.35, 0.4), halo=.38, shadow_y=None):
    """The lab's chrome orb with a glowing seam."""
    hx, hy = cx - r * .38, cy - r * .48
    seams = seam_paths(cx, cy, r * .99, *rot)
    sw = max(3.0, r * .05)
    glow = ''.join(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{sw*2.6}" stroke-linecap="round" opacity=".8"/>' for d in seams)
    glow += ''.join(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{sw*2.8}" stroke-linecap="round" filter="url(#b8)"/>' for d in seams)
    glow += ''.join(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{sw*1.4}" stroke-linecap="round" filter="url(#b3)"/>' for d in seams)
    glow += ''.join(f'<path d="{d}" fill="none" stroke="{light}" stroke-width="{sw}" stroke-linecap="round"/>' for d in seams)
    glow += ''.join(f'<path d="{d}" fill="none" stroke="{core}" stroke-width="{sw*.45}" stroke-linecap="round"/>' for d in seams)
    sh = ''
    if shadow_y is not None:
        sh = f'''<ellipse cx="{cx}" cy="{shadow_y}" rx="{r*1.15}" ry="{r*.18}" fill="{c}" opacity=".3" filter="url(#b18)"/>
 <ellipse cx="{cx}" cy="{shadow_y}" rx="{r*.6}" ry="{r*.09}" fill="#000" opacity=".7" filter="url(#b8)"/>'''
    return f'''
 <defs>
  <radialGradient id="{uid}body" cx="{hx+r*.12}" cy="{hy+r*.05}" r="{r*1.42}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a3aab4"/><stop offset=".2" stop-color="#5c636d"/><stop offset=".5" stop-color="#262a31"/><stop offset=".8" stop-color="#111316"/><stop offset="1" stop-color="#08090b"/></radialGradient>
  <radialGradient id="{uid}rim" cx="{cx}" cy="{cy}" r="{r}" gradientUnits="userSpaceOnUse"><stop offset=".72" stop-color="{c}" stop-opacity="0"/><stop offset="1" stop-color="{c}" stop-opacity=".6"/></radialGradient>
  <radialGradient id="{uid}halo" cx="{cx}" cy="{cy}" r="{r*2}" gradientUnits="userSpaceOnUse"><stop offset=".45" stop-color="{c}" stop-opacity="{halo}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>
  <clipPath id="{uid}clip"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>
 </defs>
 {sh}
 <circle cx="{cx}" cy="{cy}" r="{r*2}" fill="url(#{uid}halo)"/>
 <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{uid}body)"/>
 <g clip-path="url(#{uid}clip)">
  <rect x="{cx-r}" y="{cy+r*.02}" width="{2*r}" height="{r}" fill="#000" opacity=".25"/>
  {glow}
 </g>
 <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#{uid}rim)"/>
 <ellipse cx="0" cy="0" rx="1" ry="1" fill="url(#spec)" transform="translate({hx+r*.02:.1f} {hy:.1f}) rotate(-32) scale({r*.44:.1f} {r*.22:.1f})"/>
 <ellipse cx="{hx-r*.03:.1f}" cy="{hy-r*.02:.1f}" rx="{r*.1:.1f}" ry="{r*.055:.1f}" transform="rotate(-32 {hx-r*.03:.1f} {hy-r*.02:.1f})" fill="#fff" opacity=".9"/>'''


def streaks(c, light, lines):
    """Motion streaks: list of (x1, y1, x2, y2, width)."""
    out = ''
    for x1, y1, x2, y2, w in lines:
        out += f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w*2.2}" stroke-linecap="round" opacity=".35" filter="url(#b6)"/>'
        out += f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{light}" stroke-width="{w}" stroke-linecap="round" opacity=".7"/>'
    return out

# ---------------------------------------------------------------- game scenes

def scene_side(c, light, core):
    """Bouncer: chrome orb ricocheting between two thumb-locked steel platforms."""
    def slab(y, up):
        g = 'steel' if up else 'steelDn'
        edge = y + 26 if up else y          # lit edge faces the orb
        return f'''
 <rect x="-40" y="{y}" width="600" height="26" rx="4" fill="url(#{g})"/>
 <rect x="-40" y="{y}" width="600" height="26" rx="4" filter="url(#grain)" opacity=".7"/>
 <path d="M70 {y} V{y+26} M300 {y} V{y+26}" stroke="#000" stroke-opacity=".8" stroke-width="3"/>
 <rect x="-40" y="{edge-3}" width="600" height="6" fill="{c}" filter="url(#b3)"/>
 <rect x="-40" y="{edge-1}" width="600" height="2" fill="{light}"/>
 <rect x="-40" y="{edge-14 if up else edge-10}" width="600" height="24" fill="{c}" opacity=".12" filter="url(#b14)"/>'''
    top, bot = 92, 394          # top platform y, bottom platform y
    tsurf, bsurf = top + 26, bot
    r = 74
    ox, oy = 338, 262
    # bounce trail: comes in from the left, kisses each platform, ends at the orb
    trail = f'M-20 {bsurf-150} L70 {tsurf+3} L168 {bsurf-3} L{ox-r*.62:.0f} {oy-r*.3:.0f}'
    return (
        slab(top, True) + slab(bot, False) +
        f'<ellipse cx="70" cy="{tsurf+2}" rx="34" ry="7" fill="{light}" opacity=".7" filter="url(#b6)"/>'
        f'<ellipse cx="168" cy="{bsurf-2}" rx="34" ry="7" fill="{light}" opacity=".7" filter="url(#b6)"/>'
        + '<g opacity=".85">' + neon_path(trail, c, light, w=5) + '</g>'
        + streaks(c, light, [(150, 236, 236, 236, 3), (176, 282, 250, 282, 2.4), (196, 196, 262, 196, 2)])
        + orb('o', ox, oy, r, c, light, core, rot=(0.9, -0.5, 0.2))
    )


def scene_goal(c, light, core):
    """Smashball: neon goal frame, orb bulging the net, speed streaks behind it."""
    L, R, T, B = 66, 446, 118, 366
    net = ''
    for i in range(1, 12):
        x = L + (R - L) * i / 12
        net += f'<line x1="{x:.1f}" y1="{T}" x2="{x*0.9+25.6:.1f}" y2="{B}" />'
    for j in range(1, 8):
        y = T + (B - T) * j / 8
        net += f'<line x1="{L}" y1="{y:.1f}" x2="{R}" y2="{y:.1f}" />'
    frame = f'M{L} {B+2} V{T} H{R} V{B+2}'
    ox, oy, r = 300, 250, 78
    return (
        f'<rect x="{L}" y="{T}" width="{R-L}" height="{B-T}" fill="#000" opacity=".45"/>'
        f'<g stroke="{c}" stroke-opacity=".22" stroke-width="2">{net}</g>'
        # net bulge rings around the orb
        f'<circle cx="{ox+6}" cy="{oy-2}" r="{r+26}" fill="none" stroke="{light}" stroke-opacity=".28" stroke-width="2"/>'
        f'<circle cx="{ox+10}" cy="{oy-3}" r="{r+48}" fill="none" stroke="{c}" stroke-opacity=".16" stroke-width="2"/>'
        + floor(c, light, y=366)
        + neon_path(frame, c, light, w=9)
        + f'<rect x="{L-12}" y="{B-2}" width="24" height="10" fill="{light}" opacity=".6" filter="url(#b6)"/><rect x="{R-12}" y="{B-2}" width="24" height="10" fill="{light}" opacity=".6" filter="url(#b6)"/>'
        + streaks(c, light, [(118, 300, 210, 268, 4), (104, 250, 214, 232, 3), (140, 340, 226, 302, 2.6)])
        + f'<circle cx="{ox}" cy="{oy}" r="{r+6}" fill="{light}" opacity=".25" filter="url(#b14)"/>'
        + orb('o', ox, oy, r, c, light, core, rot=(-0.6, 0.55, -0.3), halo=.3, shadow_y=410)
    )


def scene_up(c, light, core):
    """Ascent: curved pad at the bottom flinging the orb up through chevrons."""
    pad = 'M96 358 Q256 398 416 358'
    padbody = 'M90 352 Q256 394 422 352 L426 372 Q256 416 86 372 Z'
    ox, oy, r = 256, 214, 76
    chev = lambda y, s, a: f'<path d="M{256-s} {y+s*.62:.0f} L256 {y} L{256+s} {y+s*.62:.0f}" fill="none" stroke="{c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="{a}" filter="url(#b3)"/><path d="M{256-s} {y+s*.62:.0f} L256 {y} L{256+s} {y+s*.62:.0f}" fill="none" stroke="{light}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="{a}"/>'
    return (
        # light shaft rising from the pad
        f'<path d="M180 360 L216 0 H296 L332 360 Z" fill="{c}" opacity=".06" filter="url(#b18)"/>'
        + chev(54, 46, .9) + chev(100, 38, .5)
        + floor(c, light, y=436)
        # the trail from pad to orb
        + f'<path d="M256 356 L256 {oy+r}" stroke="{c}" stroke-width="40" opacity=".18" filter="url(#b14)"/>'
        + f'<path d="M256 350 L256 {oy+r+6}" stroke="{light}" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 9" opacity=".75"/>'
        + streaks(c, light, [(214, 300, 214, 340, 2.4), (298, 296, 298, 338, 2.4)])
        # the pad: steel crescent with a neon top edge
        + f'<path d="{padbody}" fill="url(#steelDn)"/><path d="{padbody}" filter="url(#grain)" opacity=".7"/>'
        + f'<path d="{padbody}" fill="#000" opacity=".25"/>'
        + neon_path(pad, c, light, w=6)
        + f'<ellipse cx="256" cy="374" rx="60" ry="10" fill="{light}" opacity=".45" filter="url(#b8)"/>'
        + orb('o', ox, oy, r, c, light, core, rot=(0.3, 0.9, -0.2))
    )


def scene_peak(c, light, core, gold='#ffcf6b'):
    """Summit: one stone boulder on a steep ridge; gold light at the summit."""
    peak = (338, 96)
    ridge = f'M-30 440 L{peak[0]} {peak[1]} L560 380'
    body = f'M-30 440 L{peak[0]} {peak[1]} L560 380 V600 H-30 Z'
    snow = f'M{peak[0]} {peak[1]} L{peak[0]-58} 150 L{peak[0]-38} 146 L{peak[0]-24} 160 L{peak[0]-6} 140 L{peak[0]+16} 152 L{peak[0]+34} 134 L{peak[0]+46} 138 Z'
    # boulder sits on the left face of the ridge
    t = .5
    sx = -30 + (peak[0] + 30) * t
    sy = 440 + (peak[1] - 440) * t
    nx, ny = -(peak[1] - 440), (peak[0] + 30)       # normal pointing up-left
    nl = math.hypot(nx, ny); nx, ny = nx / nl, ny / nl
    if ny > 0: nx, ny = -nx, -ny
    r = 64
    bx, by = sx + nx * r, sy + ny * r
    rays = ''.join(
        f'<line x1="{peak[0]}" y1="{peak[1]-14}" x2="{peak[0]+math.cos(a)*64:.1f}" y2="{peak[1]-14+math.sin(a)*64:.1f}" stroke="{gold}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>'
        for a in [math.radians(d) for d in (-160, -130, -100, -80, -50, -20)])
    return (
        f'<circle cx="{peak[0]}" cy="{peak[1]}" r="150" fill="{gold}" opacity=".16" filter="url(#b30)"/>'
        + f'<defs><linearGradient id="mtn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c1d22"/><stop offset=".62" stop-color="#2a2b31"/><stop offset=".66" stop-color="#121317"/><stop offset="1" stop-color="#08090b"/></linearGradient></defs><path d="{body}" fill="url(#mtn)"/>'
        + f'<path d="{body}" filter="url(#grain)" opacity=".9"/>'
        # strata lines on the mountain face
        + f'<path d="M{peak[0]} {peak[1]} L300 260 L318 330 L280 520 M{peak[0]} {peak[1]} L372 230 L420 330 L470 520" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="3"/>'
        + f'<path d="{snow}" fill="#dfe6ee" opacity=".85"/><path d="{snow}" filter="url(#grain)"/>'
        + neon_path(ridge, c, light, w=6)
        + rays
        + f'<circle cx="{peak[0]}" cy="{peak[1]-14}" r="16" fill="{gold}" filter="url(#b8)"/>'
        + f'<circle cx="{peak[0]}" cy="{peak[1]-14}" r="7" fill="#fff8e0"/>'
        # little temple columns at the summit
        + f'<path d="M{peak[0]-14} {peak[1]+2} V{peak[1]-6} M{peak[0]-5} {peak[1]-1} V{peak[1]-9} M{peak[0]+5} {peak[1]-1} V{peak[1]-9} M{peak[0]+14} {peak[1]+2} V{peak[1]-6}" stroke="#fff3d0" stroke-width="2.4" opacity=".0"/>'
        + boulder(bx, by, r, c, light)
        # motion arc showing the punch up the slope
        + f'<path d="M{bx-r-30:.0f} {by+r*.9:.0f} Q{bx-r*.2:.0f} {by-r*1.6:.0f} {bx+r*1.5:.0f} {by-r*1.5:.0f}" fill="none" stroke="{light}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" opacity=".7"/>'
    )


def boulder(cx, cy, r, c, light):
    """Heavy stone sphere: rough texture, warm neon rim from the ridge light."""
    return f'''
 <defs>
  <radialGradient id="stone" cx="{cx-r*.35}" cy="{cy-r*.45}" r="{r*1.5}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a59a8e"/><stop offset=".3" stop-color="#5e5650"/><stop offset=".7" stop-color="#26221f"/><stop offset="1" stop-color="#0c0b0a"/></radialGradient>
  <radialGradient id="srim" cx="{cx}" cy="{cy}" r="{r}" gradientUnits="userSpaceOnUse"><stop offset=".7" stop-color="{c}" stop-opacity="0"/><stop offset="1" stop-color="{c}" stop-opacity=".75"/></radialGradient>
  <clipPath id="sclip"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>
 </defs>
 <ellipse cx="{cx+r*.25}" cy="{cy+r*.95}" rx="{r*.9}" ry="{r*.16}" fill="#000" opacity=".7" filter="url(#b8)" transform="rotate(-43 {cx} {cy+r})"/>
 <circle cx="{cx}" cy="{cy}" r="{r*1.7}" fill="{c}" opacity=".16" filter="url(#b18)"/>
 <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#stone)"/>
 <g clip-path="url(#sclip)">
  <rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}" filter="url(#rock)" opacity=".55"/>
  <path d="M{cx-r*.7} {cy-r*.1} Q{cx-r*.2} {cy-r*.35} {cx+r*.1} {cy+r*.05} T{cx+r*.8} {cy+r*.2}" fill="none" stroke="#000" stroke-width="3" opacity=".55"/>
  <path d="M{cx-r*.3} {cy+r*.55} Q{cx+r*.1} {cy+r*.3} {cx+r*.5} {cy+r*.6}" fill="none" stroke="#000" stroke-width="2.5" opacity=".5"/>
  <path d="M{cx-r*.1} {cy-r*.75} L{cx+r*.05} {cy-r*.4} L{cx+r*.35} {cy-r*.5}" fill="none" stroke="#000" stroke-width="2" opacity=".45"/>
 </g>
 <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#srim)"/>
 <path d="M{cx+r*.25:.1f} {cy+r*.95:.1f} A{r} {r} 0 0 0 {cx+r*.97:.1f} {cy-r*.2:.1f}" fill="none" stroke="{light}" stroke-width="2.4" opacity=".85"/>
 <ellipse cx="{cx-r*.38:.1f}" cy="{cy-r*.45:.1f}" rx="{r*.26:.1f}" ry="{r*.13:.1f}" transform="rotate(-32 {cx-r*.38:.1f} {cy-r*.45:.1f})" fill="#fff" opacity=".18" filter="url(#b3)"/>'''


def scene_orb(c, light, core):
    """Any other game: the lab orb in its own colour."""
    return floor(c, light) + orb('o', 296, 250, 104, c, light, core, rot=(0.9, -0.4, 0.3), shadow_y=410)


SCENES = {'side': scene_side, 'goal': scene_goal, 'up': scene_up, 'peak': scene_peak}

# tuned light/core tints per colour so the neon reads at tiny sizes
TINTS = {
    '#5ef2ff': ('#c9fbff', '#ffffff'),
    '#ff9a3c': ('#ffcc8f', '#fff4e6'),
    '#ff4fd8': ('#ff9ae9', '#ffe6f9'),
    '#ff5226': ('#ff9a6e', '#fff0e8'),
}


def tint(c):
    if c.lower() in TINTS:
        return TINTS[c.lower()]
    h = c.lstrip('#'); rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    mix = lambda f: '#' + ''.join(f'{int(v + (255 - v) * f):02x}' for v in rgb)
    return mix(.55), mix(.9)


def build_svg(game, mode='any'):
    """mode: 'any' (rounded corners), 'full' (square, for iOS), 'mask' (square, art inside the safe circle)."""
    c = game['color']
    light, core = tint(c)
    scene = SCENES.get(game.get('icon'), scene_orb)(c, light, core)
    glow_at = {'side': (338, 262), 'goal': (300, 250), 'up': (256, 214), 'peak': (240, 230)}.get(game.get('icon'), (296, 250))
    s = .84 if mode == 'mask' else 1.0
    inner = f'<g transform="translate({256*(1-s):.1f} {256*(1-s):.1f}) scale({s})">{scene}</g>'
    clip_open = '<g clip-path="url(#rr)">' if mode == 'any' else '<g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><clipPath id="rr"><rect width="512" height="512" rx="114"/></clipPath>{defs(c, light)}
</defs>
{clip_open}
 <rect x="-50" y="-50" width="612" height="612" fill="#050507"/>
 {wall(c, glow_at)}
 {inner}
</g></svg>'''

# ---------------------------------------------------------------- write files

def load_games():
    src = (ROOT / 'games.js').read_text()
    body = src[src.index('window.BOUNCE_LAB_GAMES =') + len('window.BOUNCE_LAB_GAMES ='):].strip().rstrip(';')
    body = re.sub(r',\s*([\]}])', r'\1', body)
    return json.loads(body)


def render(svg_path, png_path, size):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(svg_path), '-o', str(png_path)], check=True)


def write_manifest(game, gdir):
    m = {
        'name': f"{game['title']} · Bounce Lab",
        'short_name': game['title'],
        'description': game.get('tagline', ''),
        'id': './',
        'start_url': './',
        'scope': '../../',
        'display': 'standalone',
        'orientation': 'any',
        'background_color': '#050507',
        'theme_color': '#050507',
        'icons': [
            {'src': f'icons/icon-192.png?v={ICON_V}', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': f'icons/icon-512.png?v={ICON_V}', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': f'icons/maskable-512.png?v={ICON_V}', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
            {'src': f'icons/icon.svg?v={ICON_V}', 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any'},
        ],
    }
    (gdir / 'manifest.webmanifest').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')


HEAD_RULES = [
    (r'<link rel="manifest" href="[^"]*">', '<link rel="manifest" href="manifest.webmanifest?v={v}">'),
    (r'<link rel="icon" href="[^"]*" type="image/svg\+xml">', '<link rel="icon" href="icons/icon.svg?v={v}" type="image/svg+xml">'),
    (r'<link rel="apple-touch-icon" href="[^"]*">', '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png?v={v}">'),
    (r'<meta name="apple-mobile-web-app-title" content="[^"]*">', '<meta name="apple-mobile-web-app-title" content="{title}">'),
]


def patch_head(game, page):
    if not page.exists():
        return False
    html = page.read_text()
    new = html
    for pat, rep in HEAD_RULES:
        new = re.sub(pat, rep.format(v=ICON_V, title=game['title']), new, count=1)
    if new != html:
        page.write_text(new)
    return True


def main():
    only = set(sys.argv[1:])
    for g in load_games():
        if only and g['id'] not in only:
            continue
        gdir = ROOT / 'games' / g['id']
        if not gdir.exists():
            print('skip (no folder):', g['id']); continue
        idir = gdir / 'icons'; idir.mkdir(exist_ok=True)
        (idir / 'icon.svg').write_text(build_svg(g, 'any'))
        (idir / '_full.svg').write_text(build_svg(g, 'full'))
        (idir / '_mask.svg').write_text(build_svg(g, 'mask'))
        render(idir / 'icon.svg', idir / 'icon-192.png', 192)
        render(idir / 'icon.svg', idir / 'icon-512.png', 512)
        render(idir / '_full.svg', idir / 'apple-touch-icon.png', 180)
        render(idir / '_mask.svg', idir / 'maskable-512.png', 512)
        (idir / '_full.svg').unlink(); (idir / '_mask.svg').unlink()
        write_manifest(g, gdir)
        patch_head(g, gdir / 'index.html')
        print('icons:', g['id'])


if __name__ == '__main__':
    main()
