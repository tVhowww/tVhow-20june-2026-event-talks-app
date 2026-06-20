import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request
import time

app = Flask(__name__)

# Simple in-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 600  # 10 minutes cache duration in seconds

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html_to_text(html_content):
    if not html_content:
        return ""
    # Replace HTML tags with space
    text = re.sub(r'<[^>]+>', ' ', html_content)
    # Replace multiple whitespaces/newlines with a single space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_feed(force_refresh=False):
    now = time.time()
    if not force_refresh and cache["data"] and (now - cache["last_fetched"] < CACHE_DURATION):
        print("Returning cached release notes.")
        return cache["data"], None

    try:
        print(f"Fetching fresh release notes from {FEED_URL}...")
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravityFeedReader/1.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        parsed_entries = []
        entries = root.findall('atom:entry', ns)
        
        for entry in entries:
            title = entry.find('atom:title', ns)
            title_text = title.text if title is not None else ""
            
            entry_id = entry.find('atom:id', ns)
            id_text = entry_id.text if entry_id is not None else ""
            
            updated = entry.find('atom:updated', ns)
            updated_text = updated.text if updated is not None else ""
            
            link_elem = entry.find("atom:link[@rel='alternate']", ns)
            if link_elem is None:
                link_elem = entry.find("atom:link", ns)
            link_text = link_elem.attrib.get('href') if link_elem is not None else ''
            
            content_elem = entry.find('atom:content', ns)
            content_html = content_elem.text if content_elem is not None else ''
            
            # Find sub-items using h3 splits
            # GCP release notes group entries by day, and list updates using <h3>Type</h3> followed by paragraph tags.
            # We match <h3>Heading</h3>Description
            matches = list(re.finditer(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', content_html, re.DOTALL | re.IGNORECASE))
            
            updates = []
            if not matches:
                # Fallback if no <h3> was found
                plain_desc = clean_html_to_text(content_html)
                updates.append({
                    "type": "Update",
                    "html": content_html,
                    "text": plain_desc
                })
            else:
                for m in matches:
                    header = m.group(1).strip()
                    desc_html = m.group(2).strip()
                    desc_text = clean_html_to_text(desc_html)
                    updates.append({
                        "type": header,
                        "html": desc_html,
                        "text": desc_text
                    })
            
            parsed_entries.append({
                "date": title_text,
                "date_iso": updated_text,
                "link": link_text,
                "id": id_text,
                "updates": updates
            })
            
        # Update Cache
        cache["data"] = parsed_entries
        cache["last_fetched"] = now
        return parsed_entries, None

    except Exception as e:
        print(f"Error parsing feed: {str(e)}")
        # If fetch fails but we have cached data, return the cache and the error
        if cache["data"]:
            return cache["data"], f"Failed to refresh: {str(e)}. Using cached data."
        return None, str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force = request.args.get('refresh', 'false').lower() == 'true'
    data, error = parse_feed(force_refresh=force)
    
    if data is None:
        return jsonify({
            "status": "error",
            "message": error
        }), 500
        
    return jsonify({
        "status": "success",
        "data": data,
        "cached": not force and (time.time() - cache["last_fetched"] > 0),
        "last_updated": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache["last_fetched"])),
        "warning": error
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
