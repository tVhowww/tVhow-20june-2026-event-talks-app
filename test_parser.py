import xml.etree.ElementTree as ET
import urllib.request
import re

def test_parse():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = root.findall('atom:entry', ns)
        print(f"Found {len(entries)} entries.")
        
        # Test parse of first 2 entries
        for entry in entries[:2]:
            title = entry.find('atom:title', ns).text
            entry_id = entry.find('atom:id', ns).text
            updated = entry.find('atom:updated', ns).text
            
            link_elem = entry.find("atom:link[@rel='alternate']", ns)
            if link_elem is None:
                link_elem = entry.find("atom:link", ns)
            link = link_elem.attrib.get('href') if link_elem is not None else ''
            
            content_elem = entry.find('atom:content', ns)
            content_html = content_elem.text if content_elem is not None else ''
            
            print(f"\n--- Entry: {title} ({updated}) ---")
            print(f"Link: {link}")
            
            # Split the content html by <h3>
            # Let's match <h3>Heading</h3>Description
            matches = list(re.finditer(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', content_html, re.DOTALL | re.IGNORECASE))
            if not matches:
                # If no <h3> was found, the whole block is one update without an explicit header type
                print("No <h3> matches found. Raw content length:", len(content_html))
                # Fallback to whole content
                print("Content preview:", content_html[:200])
            else:
                print(f"Found {len(matches)} sub-items:")
                for i, m in enumerate(matches):
                    header = m.group(1).strip()
                    desc_html = m.group(2).strip()
                    # Clean tags for text representation (e.g. for tweets)
                    desc_text = re.sub(r'<[^>]+>', '', desc_html)
                    desc_text = re.sub(r'\s+', ' ', desc_text).strip()
                    print(f"  {i+1}. [{header}]: {desc_text[:100]}...")
                    
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_parse()
