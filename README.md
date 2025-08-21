# Sprite Rasterizer

A real-time webcam sprite rasterizer that converts live video feeds into ASCII-art style representations using custom sprites.

## Demo

https://github.com/user-attachments/assets/5a1063e3-e87f-49fb-9e7f-85739df26242

## Features

- **Real-time Processing**: Live webcam feed converted to sprite-based art in real-time
- **Custom Sprites**: Upload your own images or use text characters/emojis as sprites
- **Webcam Capture**: Instantly capture sprites directly from your webcam
- **Multiple Matching Algorithms**: Choose between color-based or brightness-based sprite selection
- **Interactive Controls**: Adjust scale, posterization effects, and color schemes
- **Responsive Design**: Works on desktop browsers with WebGL support

## Getting Started

### Prerequisites

- Modern web browser with WebGL support
- Webcam (optional, can also use static images)

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/corychainsman/sprite-rasterizer.git
   cd sprite-rasterizer
   ```

2. Start a local web server:
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

3. Open your browser and navigate to `http://localhost:8000`

### Live Demo

Try it online: [https://corychainsman.github.io/sprite-rasterizer/](https://corychainsman.github.io/sprite-rasterizer/)

## How to Use

1. **Add Sprites**: 
   - Enter text characters or emojis in the TextSprites input
   - Upload image files using the "📁 Upload Sprites" button
   - Capture sprites directly from your webcam with "📷 Capture from Webcam"

2. **Grant Camera Permission**: Allow webcam access when prompted for live video processing

3. **Adjust Settings**:
   - **Scale**: Control the grid density (more sprites = higher detail)
   - **Threshold**: Adjust posterization intensity for different artistic effects
   - **Matching Algorithm**: Choose between color or brightness-based sprite selection
   - **Colors**: Customize background and text colors

4. **Source Options**:
   - Use live webcam feed for real-time effects
   - Drop static images for processing
   - Right-click the output canvas to save your creation

## Technical Details

- **WebGL Rendering**: High-performance GPU-accelerated sprite rendering
- **Real-time Processing**: Optimized for smooth frame rates
- **Sprite Atlas**: Efficient texture packing for multiple sprites
- **Mirrored Webcam**: Natural camera preview experience
- **Responsive Grid**: Automatic aspect ratio handling

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

Requires WebGL and getUserMedia API support.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

This project is open source and available under the [MIT License](LICENSE).
