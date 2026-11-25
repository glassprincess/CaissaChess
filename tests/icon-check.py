"""Verify the selected branding source and transparent launcher artifacts."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
root = Path(__file__).resolve().parents[1]
res = root / 'app/src/main/res'
source = root / 'docs/branding/caissa-01.svg'
assert (root / 'assets/web/caissa-queen.svg').read_bytes() == source.read_bytes()
svg = ET.parse(source).getroot()
vector = ET.parse(res / 'drawable/ic_launcher.xml').getroot()
android = '{http://schemas.android.com/apk/res/android}'
assert [p.attrib['d'] for p in svg.findall('{http://www.w3.org/2000/svg}path')] == [p.attrib[android+'pathData'] for p in vector.findall('path')]
assert all(p.attrib[android+'fillColor'] == '#81B64C' for p in vector.findall('path'))
assert not (res / 'mipmap-anydpi/ic_launcher.xml').exists()
for density, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    file = res / ('mipmap-'+density) / 'ic_launcher.png'
    assert file.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
    image = Image.open(file)
    assert image.size == (size,size)
    assert image.mode == 'RGBA'
    assert image.getextrema()[3] == (0,255)
    assert image.getpixel((0,0))[3] == 0
    assert all(image.getpixel(point)[3] == 0 for point in [(0,size-1),(size-1,0),(size-1,size-1)])
    bounds = image.getbbox()
    assert 0 < bounds[0] < bounds[2] < size and 0 < bounds[1] < bounds[3] < size
    assert any(image.getpixel((x,y)) == (129,182,76,255) for y in range(size) for x in range(size))
for version in [26,33]:
    adaptive = ET.parse(res / ('mipmap-anydpi-v'+str(version)) / 'ic_launcher.xml').getroot()
    assert adaptive.find('foreground').attrib[android+'drawable'] == '@drawable/ic_launcher_foreground'
    if version == 33:
        assert adaptive.find('monochrome').attrib[android+'drawable'] == '@drawable/ic_launcher_foreground'
print('ok selected queen/laurel SVG, exact native paths, 5 transparent PNG densities, adaptive + monochrome references')
