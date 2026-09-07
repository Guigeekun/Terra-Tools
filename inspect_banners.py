import os, sys, re
sys.stdout.reconfigure(encoding='utf-8')

banner_dir = 'user-data/extracted-gamedata/Banner'
files = sorted(os.listdir(banner_dir))

chapter_banners = {}  # ch_no -> filename
section_banners = {}  # (ch_no, sec_no) -> filename
other_banners = []

for f in files:
    # Strip 32-char hex hash prefix if present
    clean = re.sub(r'^[0-9a-f]{32}', '', f)
    # Remove .png
    base = clean[:-4] if clean.endswith('.png') else clean

    # Match sp{ch}-{sec} or mp{ch}-{sec}
    m_sec = re.match(r'^(?:sp|mp|rm)(\d+)-(\d+)(?:_.*)?$', base)
    if m_sec:
        cno, sno = int(m_sec.group(1)), int(m_sec.group(2))
        section_banners[(cno, sno)] = f
        continue

    # Match sp{ch} or mp{ch}
    m_ch = re.match(r'^(?:sp|mp|rm)(\d+)(?:_.*)?$', base)
    if m_ch:
        cno = int(m_ch.group(1))
        chapter_banners[cno] = f
        continue

    other_banners.append((f, base))

print(f"Total banner files: {len(files)}")
print(f"Mapped Chapter banners: {len(chapter_banners)}")
print(f"Mapped Section banners: {len(section_banners)}")
print(f"Other banners: {len(other_banners)}")

print("\n--- Sample Chapter Banners ---")
for cno, f in sorted(chapter_banners.items())[:20]:
    print(f"Ch {cno:4d}: {f}")

print("\n--- Sample Section Banners ---")
for (cno, sno), f in sorted(section_banners.items())[:20]:
    print(f"Ch {cno:4d} Sec {sno:2d}: {f}")

print("\n--- Other Banners ---")
for f, base in other_banners:
    print(f"  {base} -> {f}")

