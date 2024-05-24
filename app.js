let map;
let imgGroup;
let imageOverlays = {};

// Make map
document.addEventListener("DOMContentLoaded", function () {
    map = L.map("map", {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false, // This disables keyboard interactions
        zoomControl: false, // This hides the zoom control
        zoomSnap: 0.25,
    }).setView([41.015137, 28.97953], 11);

    // add basemap tiles
    const CartoDB_DarkMatterNoLabels = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
        }
    );
    map.addLayer(CartoDB_DarkMatterNoLabels);
});

// Change city
let selCity = null;
function changeCity() {
    return {
        cities: [],
        activeCity: [],
        async init() {
            const response = await fetch("public/cities.json");
            const data = await response.json();
            this.cities = data.cities;
            selCity = this.cities[0];
            this.activeCity = selCity.name;
            addGeoTIFFOverlay();
        },
        button(city) {
            this.cities.map((c, i) => {
                if (c.name == city) {
                    selCity = c;
                    this.activeCity = c.name;
                }
            });
            addGeoTIFFOverlay();
        },
    };
}

// Buttons
let bandIds = null;
function toggleButtons() {
    return {
        bands: [],
        activeBands: [],
        async init() {
            const response = await fetch("public/dictionary.json");
            const data = await response.json();
            this.bands = data.bands;
            this.activeBands = this.bands;
            bandIds = this.activeBands.map((band) => this.bands.indexOf(band));
            addGeoTIFFOverlay();
            // this.activeBands.map((band) => this.bands.indexOf(band))
        },
        toggle(band) {
            if (this.activeBands.includes(band)) {
                this.activeBands = this.activeBands.filter(
                    (item) => item !== band
                );
            } else {
                this.activeBands.push(band);
            }

            bandIds = this.activeBands.map((band) => this.bands.indexOf(band));
            addGeoTIFFOverlay();
            // this.activeBands.map((band) => this.bands.indexOf(band))
        },
    };
}

// Load geotiff
let currentOverlay = false;
async function addGeoTIFFOverlay() {
    if (bandIds != null && selCity != null) {
        const url = `public/${selCity.raster}`;
        // Clean the map
        if (currentOverlay) {
            map.removeLayer(currentOverlay);
        }

        const tiff = await GeoTIFF.fromUrl(url);
        const image = await tiff.getImage();
        const rasters = await image.readRasters();

        const width = image.getWidth();
        const height = image.getHeight();
        let values = [];
        for (let i = 0; i < bandIds.length; i++) {
            const pixelValues = rasters[bandIds[i]];
            if (i == 0) {
                values = pixelValues;
            } else {
                values = values.map((v, i) => v + pixelValues[i]);
            }
        }

        // Create a spectral color scale
        const scale = chroma
            .scale("Spectral")
            .domain([Math.min(...values), Math.max(...values)]);

        // Create a canvas and draw the raster
        const canvas = document.createElement("canvas");
        const res = 5;

        canvas.width = width * res;
        canvas.height = height * res;

        const ctx = canvas.getContext("2d");

        // Disable image smoothing
        ctx.imageSmoothingEnabled = false;

        // Draw each raster value as a large rectangle
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const color = chroma(scale(values[i])).rgb();
                const alpha = values[i] > 0.00001 ? 1 : 0;

                // const color = colors[y * width + x];
                ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
                ctx.fillRect(x * res, y * res, res, res);
            }
        }

        const imageUrl = canvas.toDataURL();
        const bounds = await toExtent(image);

        currentOverlay = L.imageOverlay(imageUrl, bounds);
        currentOverlay.addTo(map);
        map.flyToBounds(bounds, {
            paddingTopLeft: [0, 100],
            paddingBottomRight: [0, 200],
        });
    }
}

async function toExtent(image) {
    try {
        const fileDirectory = image.fileDirectory;

        const tiePoints = fileDirectory.ModelTiepoint;
        const pixelScale = fileDirectory.ModelPixelScale;

        if (tiePoints && pixelScale) {
            const x = tiePoints[3];
            const y = tiePoints[4];

            const width = image.getWidth();
            const height = image.getHeight();

            const scaleX = pixelScale[0];
            const scaleY = pixelScale[1];

            // Calculate the geographic bounds
            const minX = x;
            const maxX = x + width * scaleX;
            const minY = y - height * scaleY;
            const maxY = y;

            return [
                [minY, minX],
                [maxY, maxX],
            ];
        } else {
            console.error("No tie points or pixel scale information found.");
        }
    } catch (error) {
        console.error("Error reading TIFF file:", error);
    }
}
