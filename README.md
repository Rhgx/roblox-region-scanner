# Roblox Reigon Scanner 🌍

Easily locate and visualize Roblox game servers across the globe by Place ID.

## How to Run 🛠️

### Prerequisites
- Install [Node.js](https://nodejs.org/) (v14 or newer).

### Steps
1. Clone this repository:
   ```bash
   git clone <repository-url>
   ```
2. Navigate to the project folder:
   ```bash
   cd roblox-reigon-scanner
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Add your Roblox Cookie to `config.json`:
   - Open the `config.json` file located in the project directory.
   - Add your Roblox Cookie under the `robloxCookie` field:
     ```json
     {
       "robloxCookie": "YOUR_ROBLOX_COOKIE_HERE"
     }
     ```
   - Save the file.

5. Start the server:
   ```bash
   node server.js
   ```
6. Open your browser and go to:
   [http://localhost:3000](http://localhost:3000)

## Project Structure 📂
```
public/
  index.html
  style.css
  script.js
  assets/
server.js
config.json
run.bat
```

## License 📝
MIT License. Feel free to use and modify this project.