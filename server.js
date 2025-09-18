const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3001;

let chromePath;
const platform = os.platform();
if (platform === 'win32') {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      chromePath = p;
      break;
    }
  }
} else if (platform === 'linux') {
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/opt/google/chrome/chrome'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      chromePath = p;
      break;
    }
  }
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

if (!fs.existsSync('token.json')) {
  fs.writeFileSync('token.json', JSON.stringify({}));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/do-login', async (req, res) => {
  const { email, password } = req.body;
  const v2 = JSON.parse(fs.readFileSync('token.json', 'utf8'));
  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto('https://learn.learn.nvidia.com/login');
    await page.waitForSelector('#email', { visible: true, timeout: 10000 });
    await page.type('#email', email);
    await page.click('button[type="submit"]');
    await page.waitForSelector('#signinPassword', { visible: true, timeout: 40000 });
    await page.type('#signinPassword', password);
    await page.click('#passwordLoginButton');
    await page.waitForNavigation();
    await new Promise(resolve => setTimeout(resolve, 30000));
    await page.goto('https://learn.learn.nvidia.com/dashboard');
    const cookies = await page.cookies();
    const v3 = cookies.find(c => c.name === 'sessionid');
    if (v3) {
      if (!v2[email]) v2[email] = {};
      v2[email].pass = password;
      v2[email].token = v3.value;
      if (v2[email].hasDevice === undefined) v2[email].hasDevice = false;
      fs.writeFileSync('token.json', JSON.stringify(v2));
      res.cookie('token', v3.value);
      res.redirect('/dashboard');
    } else {
      res.redirect('/?error=invalid');
    }
  } catch (e) {
    res.redirect('/?error=' + encodeURIComponent(e.message));
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/dashboard', (req, res) => {
  const token = req.cookies.token;
  if (token) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .container { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.3); text-align: center; }
          input { width: 100%; padding: 10px; margin: 10px 0; border: none; border-radius: 5px; }
          button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
          button:hover { background: #45a049; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Token Retrieved</h1>
          <input type="text" id="tokenInput" value="${token}" readonly>
          <br>
          <button onclick="copyToken()">Copy Token</button>
          <script>
            function copyToken() {
              const input = document.getElementById('tokenInput');
              input.select();
              document.execCommand('copy');
              alert('Token copied to clipboard!');
            }
          </script>
        </div>
      </body>
      </html>
    `);
  } else {
    res.redirect('/');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
