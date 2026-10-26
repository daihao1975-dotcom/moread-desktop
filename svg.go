package main

import (
	"bytes"
	"encoding/xml"
	"io"
	"strings"
)

// SVG is an image-only subset: no scripts, CSS, links, animations or external references.
func sanitizeSVG(b []byte) ([]byte, error) {
	dec := xml.NewDecoder(bytes.NewReader(b))
	var out bytes.Buffer
	enc := xml.NewEncoder(&out)
	allowed := map[string]bool{}
	for _, s := range strings.Fields("svg g path rect circle ellipse line polyline polygon text tspan defs clipPath mask linearGradient radialGradient stop title desc use symbol pattern marker") {
		allowed[s] = true
	}
	attrs := map[string]bool{}
	for _, s := range strings.Fields("id viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray opacity transform font-size font-family font-weight text-anchor dominant-baseline dx dy offset stop-color stop-opacity gradientUnits gradientTransform clip-path mask preserveAspectRatio href marker-start marker-mid marker-end refX refY markerWidth markerHeight orient patternUnits patternTransform") {
		attrs[s] = true
	}
	depth, skip := 0, 0
	root := false
	for {
		tok, e := dec.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, e
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			if !root {
				if t.Name.Local != "svg" {
					return nil, fail("svgRoot")
				}
				root = true
			}
			if skip > 0 {
				skip++
				continue
			}
			if !allowed[t.Name.Local] {
				skip = 1
				continue
			}
			a := []xml.Attr{}
			for _, v := range t.Attr {
				if !attrs[v.Name.Local] {
					continue
				}
				value := strings.TrimSpace(v.Value)
				lower := strings.ToLower(value)
				if v.Name.Local == "href" && !strings.HasPrefix(value, "#") {
					continue
				}
				if strings.Contains(lower, "url(") && !(strings.HasPrefix(lower, "url(#") && strings.HasSuffix(lower, ")")) {
					continue
				}
				if strings.Contains(lower, "://") || strings.Contains(lower, "data:") || strings.Contains(lower, "javascript:") {
					continue
				}
				a = append(a, xml.Attr{Name: xml.Name{Local: v.Name.Local}, Value: value})
			}
			t.Name = xml.Name{Local: t.Name.Local}
			if depth == 1 {
				a = append(a, xml.Attr{Name: xml.Name{Local: "xmlns"}, Value: "http://www.w3.org/2000/svg"})
			}
			t.Attr = a
			enc.EncodeToken(t)
		case xml.EndElement:
			depth--
			if skip > 0 {
				skip--
				continue
			}
			t.Name = xml.Name{Local: t.Name.Local}
			enc.EncodeToken(t)
		case xml.CharData:
			if skip == 0 {
				enc.EncodeToken(t)
			}
		case xml.Directive:
			return nil, fail("svgDTD")
		}
	}
	if !root || depth != 0 {
		return nil, fail("svgInvalid")
	}
	if e := enc.Flush(); e != nil {
		return nil, e
	}
	return out.Bytes(), nil
}
