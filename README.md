# Meridian

A choropleth world atlas of living metrics. Color every country by GDP per capita, population, life expectancy, human development, CO₂, or internet access. Pan and zoom the Equal Earth map, hover for a tooltip, click a nation for a side panel of ranks and comparison bars.

**Live:** [raw.githack.com/the-web-crawler/meridian-atlas/master/index.html](https://raw.githack.com/the-web-crawler/meridian-atlas/master/index.html)

## Try

- Switch metrics in the top pill bar — fills interpolate smoothly.
- Hover a country for value + rank.
- Click to open the detail panel and fly to the country.
- Search by name. Scroll / pinch / buttons to zoom. Escape or the reset control clears the selection.

Sample figures are compiled circa 2023–24 (World Bank / UNDP / OWID ballpark). They are for demonstration, not an official statistical release. Territories without a figure render in a muted no-data fill.

## Stack

Static HTML, CSS, and ES modules. [D3](https://d3js.org) + [world-atlas](https://github.com/topojson/world-atlas) 110m countries. No build step.
