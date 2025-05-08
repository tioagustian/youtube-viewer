#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const UserAgent = require('user-agents');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');
const { execSync } = require('child_process');

// Load environment variables
dotenv.config();

// Register plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// Auto-detect Chrome path
function findChromePath() {
  try {
    const platform = os.platform();
    let chromePath = null;
    
    if (platform === 'win32') {
      // Windows paths - prioritize regular Chrome over Chromium
      const possiblePaths = [
        // Regular Chrome paths (preferred)
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.USERPROFILE + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
        
        // Chromium paths (fallback)
        process.env.LOCALAPPDATA + '\\Chromium\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome SxS\\Application\\chrome.exe'
      ];
      
      for (const path of possiblePaths) {
        if (path && fs.existsSync(path)) {
          chromePath = path;
          break;
        }
      }
    } else if (platform === 'linux') {
      // Linux - preferring Google Chrome over Chromium
      try {
        chromePath = execSync('which google-chrome').toString().trim();
      } catch (e) {
        try {
          chromePath = execSync('which chromium-browser').toString().trim();
        } catch (e) {
          try {
            chromePath = execSync('which chromium').toString().trim();
          } catch (e) {
            // All lookups failed
          }
        }
      }
    } else if (platform === 'darwin') {
      // MacOS paths - prioritize regular Chrome over Chromium
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ];
      
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          chromePath = path;
          break;
        }
      }
    }
    
    if (chromePath) {
      // Check if path contains "chrome" to detect if this is a regular Chrome or Chromium
      const isRegularChrome = chromePath.toLowerCase().includes('google chrome') || 
                             (chromePath.toLowerCase().includes('chrome') && !chromePath.toLowerCase().includes('chromium'));
      
      console.log(`Detected ${isRegularChrome ? 'Google Chrome' : 'Chromium'} at: ${chromePath}`);
    } else {
      console.log('Chrome executable not found. Using Puppeteer bundled Chromium.');
    }
    
    return chromePath;
  } catch (error) {
    console.error('Error detecting Chrome path:', error.message);
    return null;
  }
}

// Helper function to handle errors and log diagnostic info
function logErrorDetails(error, title = 'Error') {
  console.error(`\n======== ${title} ========`);
  console.error(`Message: ${error.message}`);
  console.error(`Name: ${error.name}`);
  console.error(`Stack: ${error.stack?.slice(0, 500) || 'No stack trace'}`);
  console.error(`Platform: ${os.platform()} ${os.release()}`);
  console.error(`Node version: ${process.version}`);
  console.error(`Free memory: ${Math.round(os.freemem() / (1024 * 1024))} MB`);
  console.error(`Total memory: ${Math.round(os.totalmem() / (1024 * 1024))} MB`);
  
  // Specific advice for common errors
  if (error.message.includes('STATUS_ACCESS_VIOLATION')) {
    console.error('\n🔴 STATUS_ACCESS_VIOLATION detected!');
    console.error('This is typically caused by Windows security or permission issues.');
    console.error('Suggested solutions:');
    console.error('1. Run with --safeMode flag: node index.js --url YOUR_URL --safeMode');
    console.error('2. Try specifying custom Chrome path: node index.js --url YOUR_URL --customChromePath="C:\\Path\\To\\chrome.exe"');
    console.error('3. Run the application as Administrator');
    console.error('4. Make sure your antivirus is not blocking the application');
  } else if (error.message.includes('Failed to launch')) {
    console.error('\n🔴 Browser launch failure detected!');
    console.error('Suggested solutions:');
    console.error('1. Run with --safeMode flag: node index.js --url YOUR_URL --safeMode');
    console.error('2. Try disabling sandbox: node index.js --url YOUR_URL --noSandbox');
    console.error('3. Make sure Chrome is installed correctly on your system');
    console.error('4. Specify custom Chrome path if known: --customChromePath="path/to/chrome"');
  }
  
  console.error('============================\n');
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('url', {
    alias: 'u',
    description: 'YouTube video URL or channel URL to watch',
    type: 'string',
    demandOption: true
  })
  .option('instances', {
    alias: 'i',
    description: 'Number of instances/viewers to run',
    type: 'number',
    default: 1,
    coerce: (arg) => Math.min(Math.max(parseInt(arg, 10), 1), 10) // Limit to 1-10
  })
  .option('minDuration', {
    alias: 'm',
    description: 'Minimum watch duration in seconds',
    type: 'number',
    default: 60
  })
  .option('maxDuration', {
    alias: 'M',
    description: 'Maximum watch duration in seconds',
    type: 'number',
    default: 300
  })
  .option('headless', {
    alias: 'h',
    description: 'Run in headless mode',
    type: 'boolean',
    default: true
  })
  .option('browseChannel', {
    alias: 'c',
    description: 'Browse channel videos instead of single video',
    type: 'boolean',
    default: false
  })
  .option('maxVideos', {
    alias: 'v',
    description: 'Maximum number of videos to watch per instance',
    type: 'number',
    default: 5
  })
  .option('proxyApi', {
    alias: 'p',
    description: 'Use proxy API instead of proxies.txt file',
    type: 'boolean',
    default: false
  })
  .option('proxyApiUrl', {
    description: 'URL for proxy API',
    type: 'string',
    default: 'https://proxylist.geonode.com/api/proxy-list?speed=fast&google=true&limit=500&page=1&sort_by=lastChecked&sort_type=desc'
  })
  .option('noSandbox', {
    description: 'Disable Chrome sandbox for compatibility with some systems',
    type: 'boolean',
    default: true
  })
  .option('customChromePath', {
    description: 'Provide a custom path to Chrome executable',
    type: 'string'
  })
  .option('disableShm', {
    description: 'Disable shared memory usage (fixes some crashes)',
    type: 'boolean',
    default: true
  })
  .option('safeMode', {
    description: 'Run in safe mode with minimal features for maximum compatibility',
    type: 'boolean',
    default: false
  })
  .option('verboseErrors', {
    description: 'Show detailed error logs for debugging',
    type: 'boolean',
    default: false
  })
  .option('ignoreErrors', {
    description: 'Ignore common non-critical browser errors',
    type: 'boolean',
    default: true
  })
  .option('disableFingerprinting', {
    description: 'Disable browser fingerprinting modifications (helps with YouTube compatibility)',
    type: 'boolean',
    default: false
  })
  .option('skipAds', {
    description: 'Automatically detect and skip YouTube ads',
    type: 'boolean',
    default: true
  })
  .option('matchVideoDuration', {
    description: 'Match watch time to actual video duration (plus a small buffer)',
    type: 'boolean',
    default: true
  })
  .option('durationBuffer', {
    description: 'Extra seconds to add after video end for natural behavior',
    type: 'number',
    default: 5
  })
  .option('verifyProxies', {
    description: 'Verify proxies are working before using them',
    type: 'boolean',
    default: true
  })
  .option('fastProxyCheck', {
    description: 'Use faster but less accurate proxy verification (HTTP request instead of browser)',
    type: 'boolean',
    default: false
  })
  .option('allowDirectConnection', {
    description: 'Allow direct connection without proxy if all proxies fail',
    type: 'boolean',
    default: true
  })
  .option('includeShorts', {
    description: 'Include Shorts videos when browsing a channel',
    type: 'boolean',
    default: true
  })
  .option('includeRegular', {
    description: 'Include regular videos when browsing a channel',
    type: 'boolean',
    default: true
  })
  .option('includeLive', {
    description: 'Include Live/Stream videos when browsing a channel',
    type: 'boolean',
    default: true
  })
  .option('linuxCompatMode', {
    description: 'Use enhanced compatibility mode for Linux systems with strict CSP',
    type: 'boolean',
    default: false
  })
  .option('minimalHeadless', {
    description: 'Use minimal headless mode with fewer features but better stability',
    type: 'boolean',
    default: false
  })
  .option('winSafeMode', {
    description: 'Windows-specific safe mode to prevent STATUS_ACCESS_VIOLATION errors',
    type: 'boolean',
    default: false
  })
  .option('useFirefox', {
    description: 'Use Firefox instead of Chrome (for systems where Chrome has persistent issues)',
    type: 'boolean',
    default: false
  })
  .option('firefoxPath', {
    description: 'Custom path to Firefox executable',
    type: 'string'
  })
  .help()
  .argv;

// Common browser errors that can be safely ignored
const ignorableErrors = [
  'Notification is not defined',
  'speechSynthesis is not defined',
  'localStorage is not defined',
  'Permission denied to access property',
  'ResizeObserver loop',
  'Unauthorized operation',
  'Cannot read properties of null',
  'Error loading resource',
  'Failed to fetch',
  'Network request failed',
  'WebSocket is not supported',
  'WebGL content is not available due to GL_OUT_OF_MEMORY',
  'WebGL warning',
  'The AudioContext was not allowed to start',
  'Cannot redefine property',
  'property descriptor',
  'Permission denied',
  'Trusted Type',
  'violates CSP',
  'Content Security Policy'
];

// Helper function to check if an error can be ignored
function isIgnorableError(errorMessage) {
  if (!argv.ignoreErrors) return false;
  
  return ignorableErrors.some(errText => 
    errorMessage.toLowerCase().includes(errText.toLowerCase())
  );
}

// Display recommendations for persistent STATUS_ACCESS_VIOLATION errors
function displayStatusAccessViolationHelp() {
  console.log(`\n========== CHROME STATUS_ACCESS_VIOLATION HELP ==========`);
  console.log(`It appears you're experiencing persistent STATUS_ACCESS_VIOLATION errors with Chrome/Chromium.`);
  console.log(`This is a known issue with Chrome on certain Windows systems, especially with specific hardware configurations.`);
  console.log(`\nTry the following solutions in order:`);
  console.log(`1. Use the Windows safe mode: --winSafeMode`);
  console.log(`2. Run with the regular safe mode as well: --winSafeMode --safeMode`);
  console.log(`3. Disable headless mode: --winSafeMode --safeMode --headless false`);
  console.log(`4. Try running as Administrator (open command prompt as Admin)`);
  console.log(`5. Install Firefox and add puppeteer-firefox dependency:`);
  console.log(`   npm install puppeteer-firefox`);
  console.log(`   Then run with: --useFirefox`);
  console.log(`\nExample command for maximum compatibility:`);
  console.log(`node index.js --url YOUR_URL --winSafeMode --safeMode --headless false`);
  console.log(`==================================================\n`);
}

// Shared state to track viewed videos across instances
const globalWatchedVideos = new Set();

// Fetch data from API
function fetchFromApi(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json'
        },
        maxRedirects: 5,
        timeout: 10000
      });
      
      resolve(response.data);
    } catch (error) {
      if (error.response) {
        reject(new Error(`Error fetching from API: Status ${error.response.status}`));
      } else if (error.request) {
        reject(new Error(`Error fetching from API: No response received`));
      } else {
        reject(new Error(`Error fetching from API: ${error.message}`));
      }
    }
  });
}

// Fetch proxies from GeoNode API
async function fetchProxiesFromApi(url) {
  try {
    console.log(`Fetching proxies from API: ${url}`);
    const response = await fetchFromApi(url);
    
    if (!response.data || !Array.isArray(response.data)) {
      console.error('Invalid API response format:', JSON.stringify(response).substring(0, 200) + '...');
      console.error('Expected response with data array. Will try to adapt to the response format...');
      
      // Try to handle different response formats
      if (response.proxies && Array.isArray(response.proxies)) {
        console.log('Found proxies array in alternative location.');
        const proxies = response.proxies.map(proxy => {
          const protocol = proxy.protocols && proxy.protocols.length > 0 ? 
            proxy.protocols[0].toLowerCase() : 'http';
          return `${protocol}://${proxy.ip}:${proxy.port}`;
        });
        
        console.log(`Successfully fetched ${proxies.length} proxies from API.`);
        return proxies;
      } else if (Array.isArray(response)) {
        // If response itself is an array
        console.log('Response is directly an array.');
        const proxies = response.map(proxy => {
          const protocol = (proxy.protocols && proxy.protocols.length > 0) ? 
            proxy.protocols[0].toLowerCase() : 
            (proxy.protocol ? proxy.protocol.toLowerCase() : 'http');
          
          const ip = proxy.ip || proxy.host || proxy.address;
          const port = proxy.port;
          
          if (ip && port) {
            return `${protocol}://${ip}:${port}`;
          }
          return null;
        }).filter(Boolean);
        
        console.log(`Successfully fetched ${proxies.length} proxies from API.`);
        return proxies;
      }
      
      return [];
    }
    
    const proxies = response.data.map(proxy => {
      const protocol = proxy.protocols && proxy.protocols.length > 0 ? 
        proxy.protocols[0].toLowerCase() : 
        (proxy.protocol ? proxy.protocol.toLowerCase() : 'http');
      
      return `${protocol}://${proxy.ip}:${proxy.port}`;
    });
    
    console.log(`Successfully fetched ${proxies.length} proxies from API.`);
    return proxies;
  } catch (error) {
    console.error('Error fetching proxies from API:', error.message);
    console.log('Trying alternative proxy API format...');
    
    // Try using a different more reliable API endpoint as fallback
    try {
      const fallbackUrl = 'https://proxylist.geonode.com/api/proxy-list?speed=fast&google=true&limit=500&page=1&sort_by=lastChecked&sort_type=desc';
      console.log(`Using fallback proxy API URL: ${fallbackUrl}`);
      
      const fallbackResponse = await fetchFromApi(fallbackUrl);
      
      if (fallbackResponse.data && Array.isArray(fallbackResponse.data)) {
        const proxies = fallbackResponse.data.map(proxy => {
          return `http://${proxy.ip}:${proxy.port}`;
        });
        
        console.log(`Successfully fetched ${proxies.length} proxies from fallback API.`);
        return proxies;
      }
    } catch (fallbackError) {
      console.error('Fallback proxy API also failed:', fallbackError.message);
    }
    
    return [];
  }
}

// Fast verify proxy using axios instead of puppeteer (less accurate but much faster)
async function fastVerifyProxy(proxy) {
  try {
    console.log(`Fast testing proxy: ${proxy}`);
    
    // Extract proxy components for axios
    const proxyParts = proxy.split('://');
    const protocol = proxyParts[0];
    const hostPort = proxyParts[1].split(':');
    const host = hostPort[0];
    const port = parseInt(hostPort[1]);
    
    // Test with a simple HTTP request
    const response = await axios.get('https://www.google.com/generate_204', {
      proxy: {
        host: host,
        port: port,
        protocol: protocol
      },
      timeout: 5000,
      validateStatus: status => true // Accept any status code as success
    });
    
    // Check if the response is valid
    if (response.status === 204 || response.status === 200) {
      console.log(`✅ Proxy verified (fast): ${proxy}`);
      return true;
    }
    
    console.log(`❌ Proxy failed status check: ${proxy} - Status: ${response.status}`);
    return false;
  } catch (error) {
    console.log(`❌ Proxy failed (fast): ${proxy} - ${error.message}`);
    return false;
  }
}

// Verify if a proxy is working before using it
async function verifyProxy(proxy) {
  // Use fast verification if enabled
  if (argv.fastProxyCheck) {
    return fastVerifyProxy(proxy);
  }
  
  // Otherwise use thorough verification with puppeteer
  try {
    console.log(`Testing proxy: ${proxy}`);
    
    // Extract proxy components
    const proxyParts = proxy.split('://');
    const protocol = proxyParts[0];
    const hostPort = proxyParts[1].split(':');
    const host = hostPort[0];
    const port = parseInt(hostPort[1]);
    
    // Test in a way similar to how Puppeteer will use it
    const puppeteer = require('puppeteer-extra');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        `--proxy-server=${proxy}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      timeout: 10000,
      ignoreHTTPSErrors: true
    });
    
    try {
      const page = await browser.newPage();
      await page.goto('https://www.google.com/generate_204', {
        waitUntil: 'networkidle2',
        timeout: 10000
      });
      
      const status = await page.evaluate(() => {
        return document.title === '' && document.readyState === 'complete' ? 'success' : 'failed';
      });
      
      if (status === 'success') {
        console.log(`✅ Proxy verified: ${proxy}`);
        await browser.close();
        return true;
      }
      
      await browser.close();
      console.log(`❌ Proxy failed verification check: ${proxy}`);
      return false;
    } catch (pageError) {
      await browser.close();
      console.log(`❌ Proxy failed during page load: ${proxy} - ${pageError.message}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Proxy failed during browser launch: ${proxy} - ${error.message}`);
    return false;
  }
}

// Filter proxies to only include working ones
async function filterWorkingProxies(proxyList) {
  console.log(`Testing ${proxyList.length} proxies for availability...`);
  
  // Only test a sample of proxies to avoid long startup times
  const maxProxiesToTest = Math.min(proxyList.length, 15);
  let proxiesToTest = proxyList.slice(0, maxProxiesToTest);
  
  const workingProxies = [];
  
  // Test proxies in small batches to avoid overloading the system
  const concurrentTests = 3;
  for (let i = 0; i < proxiesToTest.length; i += concurrentTests) {
    if (workingProxies.length >= 3) {
      console.log(`Already found ${workingProxies.length} working proxies, stopping verification.`);
      break; // If we have at least 3 working proxies, we can stop testing
    }
    
    const batch = proxiesToTest.slice(i, i + concurrentTests);
    console.log(`Testing proxy batch ${Math.floor(i/concurrentTests) + 1}/${Math.ceil(proxiesToTest.length/concurrentTests)}...`);
    
    try {
      const results = await Promise.all(
        batch.map(proxy => verifyProxy(proxy))
      );
      
      batch.forEach((proxy, index) => {
        if (results[index]) {
          workingProxies.push(proxy);
        }
      });
    } catch (error) {
      console.error(`Error during proxy batch testing: ${error.message}`);
    }
  }
  
  // If we found at least one working proxy, return them
  if (workingProxies.length > 0) {
    console.log(`Found ${workingProxies.length} working proxies out of ${Math.min(proxiesToTest.length, i)} tested.`);
    return workingProxies;
  }
  
  // If we didn't find any working proxies but still have more to test, try a few more
  if (proxyList.length > maxProxiesToTest) {
    console.log(`No working proxies found in first batch. Testing a few more...`);
    const additionalProxies = proxyList.slice(maxProxiesToTest, maxProxiesToTest + 5);
    
    try {
      const results = await Promise.all(
        additionalProxies.map(proxy => verifyProxy(proxy))
      );
      
      additionalProxies.forEach((proxy, index) => {
        if (results[index]) {
          workingProxies.push(proxy);
        }
      });
    } catch (error) {
      console.error(`Error during additional proxy testing: ${error.message}`);
    }
  }
  
  console.log(`Found ${workingProxies.length} working proxies out of ${Math.min(proxyList.length, maxProxiesToTest + 5)} tested.`);
  
  // If no working proxies found, return the original list with a warning
  if (workingProxies.length === 0) {
    console.warn(`⚠️ No working proxies found! Using all proxies without verification.`);
    console.warn(`⚠️ This may cause connection errors. Consider running with --verifyProxies=false or --allowDirectConnection=true`);
    return proxyList;
  }
  
  return workingProxies;
}

// Set up proxy rotation
async function setupProxies() {
  let proxyList = [];
  
  // If proxyApi is enabled, fetch from API
  if (argv.proxyApi) {
    proxyList = await fetchProxiesFromApi(argv.proxyApiUrl);
    // Save fetched proxies to file for debugging/future use
    if (proxyList.length > 0) {
      const proxyContent = proxyList.join('\n');
      fs.writeFileSync('./fetched_proxies.txt', proxyContent, 'utf8');
      console.log('Fetched proxies saved to fetched_proxies.txt');
      
      // Verify and filter proxies if verification is enabled
      if (argv.verifyProxies) {
        try {
          proxyList = await filterWorkingProxies(proxyList);
        } catch (error) {
          console.error('Error verifying proxies:', error.message);
        }
      } else {
        console.log('Proxy verification disabled. Using proxies without verification.');
      }
    }
  }
  
  // If no proxies from API or proxyApi not enabled, try proxies.txt
  if (proxyList.length === 0) {
    try {
      if (fs.existsSync('./proxies.txt')) {
        proxyList = fs.readFileSync('./proxies.txt', 'utf8')
          .split('\n')
          .filter(line => line.trim() !== '' && !line.startsWith('#'));
        console.log(`Loaded ${proxyList.length} proxies from proxies.txt`);
        
        // Verify and filter proxies from file as well if verification is enabled
        if (argv.verifyProxies) {
          try {
            proxyList = await filterWorkingProxies(proxyList);
          } catch (error) {
            console.error('Error verifying proxies from file:', error.message);
          }
        } else {
          console.log('Proxy verification disabled. Using proxies from file without verification.');
        }
      }
    } catch (error) {
      console.log('No proxy list found. Running without proxies.');
    }
  }
  
  return proxyList;
}

// Set up user agent rotation
function getRandomUserAgent() {
  return new UserAgent({ deviceCategory: 'desktop' }).toString();
}

// Function to randomize viewport size within reasonable limits
function getRandomViewport() {
  const widths = [1366, 1440, 1536, 1600, 1920];
  const heights = [768, 900, 864, 1080];
  
  const width = widths[Math.floor(Math.random() * widths.length)];
  const height = heights[Math.floor(Math.random() * heights.length)];
  
  return { width, height };
}

// Function to get video duration
async function getVideoDuration(page, instanceId) {
  try {
    const duration = await safeEvaluate(page, () => {
      // Try various selectors to find the duration element
      const videoElement = document.querySelector('video');
      if (videoElement && !isNaN(videoElement.duration)) {
        return videoElement.duration;
      }
      
      // Get duration from time display
      const timeDisplay = document.querySelector('.ytp-time-duration');
      if (timeDisplay) {
        const timeText = timeDisplay.textContent || '';
        const timeParts = timeText.split(':').map(Number);
        
        if (timeParts.length === 3) { // hours:minutes:seconds
          return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        } else if (timeParts.length === 2) { // minutes:seconds
          return timeParts[0] * 60 + timeParts[1];
        }
      }
      
      // Default duration if nothing found
      return 300; // 5 minutes default
    });
    
    console.log(`[Instance ${instanceId}] Video duration: ${duration} seconds`);
    return duration;
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error getting video duration: ${error.message}`);
    return 300; // Default to 5 minutes on error
  }
}

// Function to calculate optimal watch duration based on video length
function calculateWatchDuration(videoDuration, instanceId, videoType = 'regular') {
  // For shorts, use a shorter duration range
  if (videoType === 'short') {
    // Shorts typically 15-60 seconds, so watch for that duration plus a small buffer
    const shortsDuration = videoDuration ? 
      Math.floor(videoDuration) + Math.floor(Math.random() * 5) + 1 : // Actual duration + 1-5 seconds
      Math.floor(15 + Math.random() * 45); // Random between 15-60 seconds if duration unknown
    
    console.log(`[Instance ${instanceId}] 📱 Short video - adjusted watch time: ${shortsDuration}s`);
    return shortsDuration;
  }
  
  if (!videoDuration || !argv.matchVideoDuration) {
    // If no duration detected or feature disabled, use random duration from args
    return Math.floor(
      argv.minDuration + Math.random() * (argv.maxDuration - argv.minDuration)
    );
  }
  
  // Add buffer seconds to make behavior more natural (user might close slightly after video ends)
  const buffer = argv.durationBuffer;
  const watchDuration = Math.floor(videoDuration) + buffer;
  
  // Cap maximum watch time if needed
  const maxDuration = argv.maxDuration;
  if (watchDuration > maxDuration) {
    console.log(`[Instance ${instanceId}] ⚠️ Video is longer than max watch time (${Math.floor(videoDuration)}s vs ${maxDuration}s max)`);
    // Watch a percentage of the video instead (75-95%)
    const percentage = 0.75 + Math.random() * 0.2;
    return Math.floor(videoDuration * percentage);
  }
  
  return watchDuration;
}

// Function to generate random watch behavior
function getRandomBehavior(videoDuration, instanceId, videoType = 'regular') {
  const behavior = {
    scrollProbability: Math.random() * 0.3, // 0-30% chance to scroll
    commentScrollProbability: Math.random() * 0.2, // 0-20% chance to scroll comments
    volumeChangeProbability: Math.random() * 0.15, // 0-15% chance to change volume
    pausePlayProbability: Math.random() * 0.1 // 0-10% chance to pause/play
  };
  
  // Adjust behavior based on video type
  if (videoType === 'short') {
    // Shorts have different behavior - less likely to scroll comments, more likely to scroll video
    behavior.scrollProbability = Math.random() * 0.5; // 0-50% chance to scroll (higher)
    behavior.commentScrollProbability = Math.random() * 0.05; // 0-5% chance (lower)
    behavior.pausePlayProbability = Math.random() * 0.05; // 0-5% chance (lower)
  } else if (videoType === 'live') {
    // Live streams have different behavior - more focus on comments, less scrolling
    behavior.scrollProbability = Math.random() * 0.15; // 0-15% chance to scroll (lower)
    behavior.commentScrollProbability = Math.random() * 0.4; // 0-40% chance (higher)
    behavior.pausePlayProbability = Math.random() * 0.05; // 0-5% chance (lower)
  }
  
  // Calculate watch duration based on video type
  behavior.watchDuration = calculateWatchDuration(videoDuration, instanceId, videoType);
  
  return behavior;
}

// Random delay function to simulate human behavior
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Function to check if URL is a channel
function isChannelUrl(url) {
  return url.includes('/channel/') || 
         url.includes('/c/') || 
         url.includes('/user/') || 
         url.includes('/@');
}

// Safe evaluate function to handle Trusted Types policies
async function safeEvaluate(page, fn) {
  try {
    // Add Trusted Types policy handler to the page if not already added
    await page.evaluateOnNewDocument(() => {
      if (!window.trustedTypes) {
        // Create a mock Trusted Types API if not supported
        window.trustedTypes = {
          createPolicy: (name, rules) => rules
        };
      }
      
      // Create a policy that allows script execution
      window.trustedTypesPolicy = window.trustedTypes.createPolicy('youtube-viewer-policy', {
        createScript: (script) => script,
        createHTML: (html) => html,
        createScriptURL: (url) => url
      });
    });
    
    // Execute function with Trusted Types support
    return await page.evaluate(fn);
  } catch (error) {
    // Handle Trusted Types errors
    if (error.message.includes('Trusted Type') || error.message.includes('trustedTypes')) {
      console.error('Trusted Types error detected, trying alternative approach');
      
      // Fall back to a basic evaluate if the advanced method fails
      return await page.evaluate(fn);
    }
    
    // Re-throw other errors
    throw error;
  }
}

// Function to safely extract videos from the current page
async function safeExtractVideosFromPage(page) {
  // Use our safe evaluation helper to handle Trusted Types policies
  return await safeEvaluate(page, () => {
    const results = [];
    
    // Get all possible video links more safely
    const videoElements = Array.from(document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]'));
    
    videoElements.forEach(element => {
      if (!element || !element.href) return; // Skip invalid elements
      
      const href = element.href || '';
      // Get title safely
      const title = element.getAttribute('title') || element.innerText || element.textContent || 'Unknown';
      
      if (href && (href.includes('/watch?v=') || href.includes('/shorts/'))) {
        // Determine video type based on containers or other indicators
        let videoType = 'regular';
        
        // Determine if it's a short
        if (href.includes('/shorts/')) {
          videoType = 'short';
        } 
        // Check for live indicators
        else if ((element.querySelector('[class*="live"]') !== null) || 
                (element.closest('[class*="live"]') !== null) ||
                title.toLowerCase().includes('live') ||
                (element.closest('[class*="badge-style-type-live"]') !== null)) {
          videoType = 'live';
        }
        
        results.push({
          url: href,
          title: title.trim(),
          type: videoType
        });
      }
    });
    
    return results;
  });
}

// Function to extract videos from a channel page
async function extractVideosFromChannel(page, maxVideos = 20) {
  console.log(`Extracting videos from channel...`);
  
  // Track all found videos with their types
  const allVideos = [];
  
  // Extract from Videos tab
  console.log('Looking for videos in Videos tab...');
  try {
    // We're already on the Videos tab from the navigation function
    
    // Scroll down to load more videos - using a safer approach
    for (let i = 0; i < 3; i++) {
      await safeEvaluate(page, () => window.scrollBy(0, window.innerHeight * 3));
      await randomDelay(1000, 2000);
    }
    
    const regularVideos = await safeExtractVideosFromPage(page);
    console.log(`Found ${regularVideos.length} videos in Videos tab`);
    allVideos.push(...regularVideos);
  } catch (error) {
    console.error(`Error extracting from Videos tab: ${error.message}`);
  }
  
  // Extract from Shorts tab if enabled
  if (argv.includeShorts) {
    console.log('Looking for videos in Shorts tab...');
    try {
      // Navigate to Shorts tab
      const shortsTabUrl = new URL(await page.url());
      shortsTabUrl.pathname = shortsTabUrl.pathname.replace(/\/videos\/?$/, '').replace(/\/$/, '') + '/shorts';
      
      await navigateWithRetries(page, shortsTabUrl.toString(), 'Channel');
      
      // Scroll down to load more shorts - using a safer approach
      for (let i = 0; i < 2; i++) {
        await safeEvaluate(page, () => window.scrollBy(0, window.innerHeight * 3));
        await randomDelay(1000, 2000);
      }
      
      const shorts = await safeExtractVideosFromPage(page);
      console.log(`Found ${shorts.length} videos in Shorts tab`);
      allVideos.push(...shorts);
    } catch (error) {
      console.error(`Error extracting from Shorts tab: ${error.message}`);
    }
  } else {
    console.log('Skipping Shorts tab (disabled)');
  }
  
  // Extract from Live tab if enabled
  if (argv.includeLive) {
    console.log('Looking for videos in Live tab...');
    try {
      // Navigate to Live tab (now called streams)
      const liveTabUrl = new URL(await page.url());
      liveTabUrl.pathname = liveTabUrl.pathname.replace(/\/shorts\/?$/, '').replace(/\/$/, '') + '/streams';
      
      await navigateWithRetries(page, liveTabUrl.toString(), 'Channel');
      
      // Scroll down to load more streams - using a safer approach
      for (let i = 0; i < 2; i++) {
        await safeEvaluate(page, () => window.scrollBy(0, window.innerHeight * 3));
        await randomDelay(1000, 2000);
      }
      
      const liveVideos = await safeExtractVideosFromPage(page);
      console.log(`Found ${liveVideos.length} videos in Live tab`);
      allVideos.push(...liveVideos);
    } catch (error) {
      console.error(`Error extracting from Live tab: ${error.message}`);
    }
  } else {
    console.log('Skipping Live tab (disabled)');
  }
  
  // Remove duplicates based on URL
  const uniqueVideos = [];
  const videoUrls = new Set();
  
  for (const video of allVideos) {
    if (!videoUrls.has(video.url)) {
      videoUrls.add(video.url);
      uniqueVideos.push(video);
    }
  }
  
  // Filter videos based on user preferences for video types
  console.log(`Total unique videos found across all tabs: ${uniqueVideos.length}`);
  
  // Apply filtering based on user preferences
  const filteredVideos = uniqueVideos.filter(video => {
    if (video.type === 'regular' && !argv.includeRegular) return false;
    if (video.type === 'short' && !argv.includeShorts) return false;
    if (video.type === 'live' && !argv.includeLive) return false;
    return true;
  });
  
  console.log(`After filtering by video types (regular: ${argv.includeRegular}, shorts: ${argv.includeShorts}, live: ${argv.includeLive}): ${filteredVideos.length} videos`);
  return filteredVideos.slice(0, maxVideos);
}

// Function to detect and skip YouTube ads
async function checkAndSkipAds(page, instanceId) {
  try {
    // Check if ad is playing
    const isAdPlaying = await safeEvaluate(page, () => {
      // Check multiple indicators for ads
      const adIndicators = [
        '.ad-showing', // Class on video player during ads
        '.ytp-ad-player-overlay', // Ad overlay element
        '.html5-video-player.ad-created', // Another ad class
        '.ytp-ad-text', // Ad text overlay
        '.ytp-ad-preview-container' // Ad preview container
      ];
      
      // Check if any ad indicators exist
      return adIndicators.some(selector => document.querySelector(selector) !== null);
    });
    
    if (isAdPlaying) {
      console.log(`[Instance ${instanceId}] 🔄 Ad detected, attempting to skip...`);
      
      // Try to find and click the skip button
      const wasSkipped = await safeEvaluate(page, () => {
        const skipButtons = [
          '.ytp-ad-skip-button', // Main skip button
          '.ytp-ad-skip-button-modern', // New skip button design
          '.ytp-skip-ad-button', // Alternative skip button
          '.videoAdUiSkipButton', // Another skip button variation
          '[data-is-ad-button="true"]' // Generic ad button
        ];
        
        // Try all skip buttons
        for (const selector of skipButtons) {
          const skipButton = document.querySelector(selector);
          if (skipButton) {
            skipButton.click();
            return true;
          }
        }
        
        return false;
      });
      
      if (wasSkipped) {
        console.log(`[Instance ${instanceId}] ✅ Ad skipped successfully`);
      } else {
        console.log(`[Instance ${instanceId}] ⚠️ Skip button not found yet, trying alternative methods...`);
        
        // If skipping fails, try additional methods
        try {
          // Try to skip using more aggressive methods
          const retrySkip = await safeEvaluate(page, () => {
            // Try clicking any element that might skip ads
            const potentialSkipElements = document.querySelectorAll('[class*="skip" i], [class*="ad" i] button, [data-is-ad="true"] button');
            let clicked = false;
            
            potentialSkipElements.forEach(element => {
              // Skip non-visible elements
              if (!element.offsetParent) return;
              
              // Try to click the element
              element.click();
              clicked = true;
            });
            
            return clicked;
          });
          
          if (retrySkip) {
            console.log(`[Instance ${instanceId}] ✅ Ad skipped with alternative method`);
          } else {
            // If still can't skip, try closing overlay ads
            const closedAd = await safeEvaluate(page, () => {
              const closeButtons = document.querySelectorAll('.ytp-ad-overlay-close-button, [class*="close" i][class*="ad" i]');
              let closed = false;
              
              closeButtons.forEach(button => {
                button.click();
                closed = true;
              });
              
              return closed;
            });
            
            if (closedAd) {
              console.log(`[Instance ${instanceId}] ✅ Closed ad overlay`);
            } else {
              // If ad can't be skipped, wait a bit and let it play
              console.log(`[Instance ${instanceId}] ⏳ Ad can't be skipped, waiting for it to finish...`);
              // Wait a bit before next check
              await randomDelay(2000, 3000);
            }
          }
        } catch (skipError) {
          console.error(`[Instance ${instanceId}] Error during advanced ad skipping:`, skipError.message);
        }
      }
      
      return true; // Ad was detected (even if not skipped)
    }
    
    return false; // No ad detected
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error checking for ads:`, error.message);
    return false;
  }
}

// Function to check and handle video playback errors
async function checkAndFixPlaybackErrors(page, instanceId) {
  try {
    // Check for various error messages
    const hasError = await safeEvaluate(page, () => {
      try {
        // Common error indicators
        const errorMessage = document.querySelector('.ytp-error, .ytp-error-content-wrap-reason');
        const errorOverlay = document.querySelector('.html5-video-player.ytp-error');
        const errorIcon = document.querySelector('.ytp-error-content-wrap-icon');
        
        // Specific error text
        const errorTexts = [
          'something went wrong',
          'refresh',
          'try again',
          'error occurred',
          'playback error',
          'video unavailable'
        ];
        
        // Check if error message contains any of the error texts
        if (errorMessage) {
          const messageText = errorMessage.textContent ? errorMessage.textContent.toLowerCase() : '';
          return errorTexts.some(text => messageText.includes(text));
        }
        
        // Check for visual error indicators
        return !!errorOverlay || !!errorIcon;
      } catch (error) {
        // Handle errors during error detection
        console.error("Error checking for playback issues:", error.message);
        return false;
      }
    });
    
    if (hasError) {
      console.log(`[Instance ${instanceId}] 🛑 Video playback error detected. Attempting to fix...`);
      
      // Try refreshing the player
      const wasFixed = await safeEvaluate(page, () => {
        try {
          // Try clicking any retry/refresh button
          const retryButtons = [
            '.ytp-error-content-wrap-reason button',
            '.ytp-error button',
            '[aria-label*="Refresh"]',
            '[aria-label*="Try Again"]'
          ];
          
          // Try each retry button
          for (const selector of retryButtons) {
            const button = document.querySelector(selector);
            if (button) {
              button.click();
              return true;
            }
          }
          
          // If no button found, try refreshing the page
          return false;
        } catch (e) {
          return false;
        }
      });
      
      if (wasFixed) {
        console.log(`[Instance ${instanceId}] 🔄 Clicked refresh/retry button`);
        // Wait for player to reload
        await randomDelay(2000, 4000);
      } else {
        // If clicking buttons didn't work, reload the entire page
        console.log(`[Instance ${instanceId}] 🔄 Refreshing page to fix playback error...`);
        await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for video player to load again
        try {
          await page.waitForSelector('.html5-video-container', { timeout: 30000 });
          console.log(`[Instance ${instanceId}] ✅ Page refreshed, video player reloaded`);
          
          // Try playing video again
          await safeEvaluate(page, () => {
            const video = document.querySelector('video');
            if (video && video.paused) {
              video.play();
            }
          });
        } catch (error) {
          console.error(`[Instance ${instanceId}] Failed to reload video after refresh: ${error.message}`);
        }
      }
      
      return true; // Error was detected and fix attempted
    }
    
    return false; // No error detected
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error checking for playback issues: ${error.message}`);
    return false;
  }
}

// Function to set up ad detection and skipping
async function setupAdSkipping(page, instanceId) {
  if (!argv.skipAds) return; // Skip if feature is disabled
  
  // Initial ad check
  await checkAndSkipAds(page, instanceId);
  
  // Set interval to periodically check for ads
  const adCheckInterval = setInterval(async () => {
    try {
      await checkAndSkipAds(page, instanceId);
    } catch (e) {
      // Ignore errors in the interval
    }
  }, 5000); // Check for ads every 5 seconds
  
  // Return the interval ID so it can be cleared later
  return adCheckInterval;
}

// Function to monitor video playback and fix errors
async function setupPlaybackMonitor(page, instanceId) {
  // Initial check for errors
  await checkAndFixPlaybackErrors(page, instanceId);
  
  // Set interval to periodically check for playback errors
  const playbackCheckInterval = setInterval(async () => {
    try {
      const hadError = await checkAndFixPlaybackErrors(page, instanceId);
      
      // Also check if video is actually playing
      if (!hadError) {
        // Verify video is actually playing
        const isStalled = await safeEvaluate(page, () => {
          const video = document.querySelector('video');
          if (!video) return false;
          
          // Consider video stalled if it's paused but not by user action
          // or if current time hasn't changed in a while
          return (video.paused && video.readyState >= 3) || 
                 (video.readyState < 3 && video.networkState === 2);
        });
        
        if (isStalled) {
          console.log(`[Instance ${instanceId}] 🔍 Video appears to be stalled. Attempting to resume...`);
          await safeEvaluate(page, () => {
            const video = document.querySelector('video');
            if (video) {
              // Try playing
              video.play().catch(() => {});
              
              // If that doesn't work, try seeking slightly
              setTimeout(() => {
                if (video.paused && video.currentTime > 0) {
                  video.currentTime += 0.1;
                  video.play().catch(() => {});
                }
              }, 1000);
            }
          });
        }
      }
    } catch (e) {
      // Ignore errors in the interval
    }
  }, 15000); // Check playback every 15 seconds (less frequent than ad check)
  
  // Return the interval ID so it can be cleared later
  return playbackCheckInterval;
}

// Function to navigate to a URL with retries
async function navigateWithRetries(page, url, instanceId, maxRetries = 3) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      console.log(`[Instance ${instanceId}] Navigating to: ${url}${retries > 0 ? ` (attempt ${retries + 1}/${maxRetries})` : ''}`);
      
      await page.goto(url, { 
        waitUntil: retries === 0 ? 'networkidle2' : 'domcontentloaded', // Fall back to domcontentloaded on retries
        timeout: 60000 
      });
      
      // Extra checks to verify page loaded properly
      const pageTitle = await page.title().catch(() => '');
      
      // If we got an empty page or error page, throw error
      if (pageTitle.includes('Error') || pageTitle === '') {
        throw new Error('Received empty or error page');
      }
      
      // Additional wait for YouTube to initialize
      await page.waitForTimeout(2000);
      
      // Success
      console.log(`[Instance ${instanceId}] Successfully loaded: ${url}`);
      return true;
    } catch (error) {
      retries++;
      console.error(`[Instance ${instanceId}] Navigation error (attempt ${retries}/${maxRetries}): ${error.message}`);
      
      if (retries >= maxRetries) {
        console.error(`[Instance ${instanceId}] Failed to load URL after ${maxRetries} attempts: ${url}`);
        throw error; // Re-throw the error to be handled by the caller
      }
      
      // Wait before retry with increasing backoff
      const backoff = 2000 * Math.pow(2, retries - 1); // 2s, 4s, 8s...
      console.log(`[Instance ${instanceId}] Retrying in ${backoff / 1000} seconds...`);
      await page.waitForTimeout(backoff);
      
      // For persistent errors, try cleaning up and refreshing the page
      try {
        console.log(`[Instance ${instanceId}] Clearing cache and cookies before retry...`);
        await page.evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {
            // Ignore storage access errors
          }
        });
        await page.setCacheEnabled(false);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }
}

// Function to check if URL is a channel
function isChannelUrl(url) {
  return url.includes('/channel/') || 
         url.includes('/c/') || 
         url.includes('/user/') || 
         url.includes('/@');
}

// YouTube viewer instance
async function runYouTubeViewer(instanceId, proxyList) {
  let browser = null;
  const instanceWatchedVideos = new Set();
  let adCheckInterval = null;
  let playbackCheckInterval = null;
  
  try {
    console.log(`[Instance ${instanceId}] Starting...`);
    
    // Determine browser to use - Chrome by default, Firefox if specified
    if (argv.useFirefox) {
      console.log(`[Instance ${instanceId}] Using Firefox instead of Chrome due to useFirefox option`);
      console.warn(`[Instance ${instanceId}] WARNING: puppeteer-firefox is deprecated and no longer maintained.`);
      console.warn(`[Instance ${instanceId}] Using Google Chrome is recommended instead for better stability.`);
      
      try {
        // Try to load Firefox module
        const firefoxLauncher = require('puppeteer-firefox');
        console.log(`[Instance ${instanceId}] Firefox module found, configuring browser...`);
        
        // Configure Firefox browser options
        const firefoxOptions = {
          headless: argv.headless,
          args: ['--width=1920', '--height=1080']
        };
        
        // Use custom Firefox path if provided
        if (argv.firefoxPath) {
          firefoxOptions.executablePath = argv.firefoxPath;
          console.log(`[Instance ${instanceId}] Using custom Firefox path: ${argv.firefoxPath}`);
        }
        
        console.log(`[Instance ${instanceId}] Launching Firefox browser...`);
        browser = await firefoxLauncher.launch(firefoxOptions);
        console.log(`[Instance ${instanceId}] Firefox browser launched successfully`);
      } catch (firefoxError) {
        console.error(`[Instance ${instanceId}] Error launching Firefox: ${firefoxError.message}`);
        console.error(`[Instance ${instanceId}] Falling back to Chrome/Chromium...`);
        browser = null; // Ensure browser is null so we proceed with Chrome setup
      }
    }
    
    // If Firefox wasn't used or failed to launch, use Chrome/Chromium
    if (!browser) {
      // Determine Chrome path
      let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (argv.customChromePath) {
        if (fs.existsSync(argv.customChromePath)) {
          chromePath = argv.customChromePath;
          console.log(`[Instance ${instanceId}] Using custom Chrome path: ${chromePath}`);
        } else {
          console.warn(`[Instance ${instanceId}] Custom Chrome path not found: ${argv.customChromePath}`);
        }
      } else {
        // Auto-detect Chrome
        chromePath = findChromePath();
      }
      
      // Build browser arguments based on options
      const browserArgs = [];
      
      // Always add these basic args
      browserArgs.push('--disable-infobars');
      browserArgs.push('--window-size=1920,1080');
      browserArgs.push('--disable-notifications');
      browserArgs.push('--disable-extensions');
      
      // Conditional args based on user options
      if (argv.noSandbox) {
        browserArgs.push('--no-sandbox');
        browserArgs.push('--disable-setuid-sandbox');
      }
      
      if (argv.disableShm) {
        browserArgs.push('--disable-dev-shm-usage');
      }
      
      // Additional stability args (always added)
      browserArgs.push('--disable-accelerated-2d-canvas');
      browserArgs.push('--disable-gpu');
      
      // Safe mode - add all compatibility options
      if (argv.safeMode) {
        browserArgs.push('--disable-web-security');
        browserArgs.push('--disable-features=site-per-process');
        browserArgs.push('--disable-features=IsolateOrigins');
        browserArgs.push('--disable-site-isolation-trials');
        browserArgs.push('--disable-features=TranslateUI');
        browserArgs.push('--disable-breakpad');
        browserArgs.push('--disable-sync');
        browserArgs.push('--disable-background-networking');
        browserArgs.push('--disable-default-apps');
        browserArgs.push('--disable-extensions');
        browserArgs.push('--disable-component-extensions-with-background-pages');
        browserArgs.push('--disable-backgrounding-occluded-windows');
        browserArgs.push('--disable-component-update');
        browserArgs.push('--metrics-recording-only');
        browserArgs.push('--mute-audio');
        browserArgs.push('--no-default-browser-check');
        browserArgs.push('--no-first-run');
        browserArgs.push('--password-store=basic');
      } else {
        // Just add mute audio if not in safe mode
        browserArgs.push('--mute-audio');
      }
      
      // Linux compatibility mode - add extra args
      if (argv.linuxCompatMode || os.platform() === 'linux') {
        console.log(`[Instance ${instanceId}] Enabling Linux compatibility mode...`);
        browserArgs.push('--disable-web-security');
        browserArgs.push('--allow-running-insecure-content');
        browserArgs.push('--disable-features=IsolateOrigins,site-per-process,SitePerProcess');
        browserArgs.push('--flag-switches-begin');
        browserArgs.push('--disable-site-isolation-trials');
        browserArgs.push('--flag-switches-end');
      }
      
      // Set up browser options with more robust error handling
      const launchOptions = {
        headless: argv.headless ? (argv.safeMode ? false : 'new') : false, // Don't use headless in safe mode
        executablePath: chromePath || null, // Will use bundled Chromium if null
        ignoreHTTPSErrors: true,
        dumpio: false,
        args: browserArgs
      };
      
      // Check if we're running on Windows to add Windows-specific fixes
      const isWindows = os.platform() === 'win32';
      if (isWindows) {
        console.log(`[Instance ${instanceId}] Detected Windows platform, applying specific optimizations...`);
        
        // Add Windows-specific flags to prevent STATUS_ACCESS_VIOLATION
        launchOptions.args.push('--disable-gpu-sandbox');
        launchOptions.args.push('--no-sandbox');
        launchOptions.args.push('--disable-setuid-sandbox');
        
        // Increase default browser timeout for Windows
        launchOptions.timeout = 120000; // 2 minutes
        
        // Force processes to close properly on Windows
        launchOptions.handleSIGINT = true;
        launchOptions.handleSIGTERM = true;
        launchOptions.handleSIGHUP = true;
      }
      
      // Apply Windows-specific safe mode if enabled
      if (isWindows && argv.winSafeMode) {
        console.log(`[Instance ${instanceId}] Windows safe mode enabled. Using special configuration to prevent STATUS_ACCESS_VIOLATION...`);
        
        // Use a more conservative configuration
        launchOptions.args.push('--disable-gpu');
        launchOptions.args.push('--disable-software-rasterizer');
        launchOptions.args.push('--disable-dev-shm-usage');
        launchOptions.args.push('--disable-accelerated-2d-canvas');
        launchOptions.args.push('--single-process');
        launchOptions.args.push('--js-flags=--max-old-space-size=2048');
        
        // Disable features that might cause memory issues
        launchOptions.args.push('--disable-features=site-per-process,IsolateOrigins,SitePerProcess');
        
        // Disable extensions for better stability
        launchOptions.args.push('--disable-extensions');
        
        // Automatically disable headless mode if Windows safe mode is enabled
        if (launchOptions.headless) {
          console.log(`[Instance ${instanceId}] Disabling headless mode for Windows safe mode...`);
          launchOptions.headless = false;
          // Remove any headless flags
          launchOptions.args = launchOptions.args.filter(arg => !arg.includes('--headless'));
        }
        
        // Try to terminate any running Chrome processes before starting
        try {
          console.log(`[Instance ${instanceId}] Terminating existing Chrome processes...`);
          execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
        } catch (e) {
          // Ignore errors - process might not exist
        }
      }
      
      // Add headless mode specific arguments if needed
      if (argv.headless) {
        // Fix for Chrome crashes in headless mode
        console.log(`[Instance ${instanceId}] Using crash-resistant headless configuration`);
        
        // These prevent crashes in headless mode
        launchOptions.args.push('--disable-gpu');
        launchOptions.args.push('--disable-software-rasterizer');
        launchOptions.args.push('--disable-dev-shm-usage');
        launchOptions.args.push('--disable-accelerated-2d-canvas');
        launchOptions.args.push('--no-first-run');
        launchOptions.args.push('--no-zygote');
        
        // Only use single-process mode in minimal headless mode as it can cause issues
        if (argv.minimalHeadless) {
          launchOptions.args.push('--single-process');
        }
        
        launchOptions.args.push('--disable-setuid-sandbox');
        
        // Fix for Trusted Type policy in headless mode
        launchOptions.args.push('--disable-web-security');
        launchOptions.args.push('--allow-running-insecure-content');
        
        // These help with Content Security Policy issues
        launchOptions.args.push('--disable-features=IsolateOrigins,site-per-process');
        launchOptions.args.push('--disable-site-isolation-trials');
        
        // Use minimal functionality in minimal headless mode
        if (argv.minimalHeadless) {
          console.log(`[Instance ${instanceId}] Using minimal headless mode for maximum stability`);
          launchOptions.args.push('--blink-settings=imagesEnabled=true');
          launchOptions.args.push('--disable-extensions');
          launchOptions.args.push('--disable-component-extensions-with-background-pages');
          launchOptions.args.push('--disable-default-apps');
          launchOptions.args.push('--disable-translate');
          launchOptions.args.push('--disable-sync');
          launchOptions.args.push('--hide-scrollbars');
          launchOptions.args.push('--metrics-recording-only');
          launchOptions.args.push('--mute-audio');
          launchOptions.args.push('--no-default-browser-check');
          launchOptions.args.push('--no-experiments');
          launchOptions.args.push('--no-pings');
          launchOptions.args.push('--no-sandbox');
        }
        
        // Additional memory settings to prevent crashes
        launchOptions.args.push('--memory-pressure-off');
        
        // Switch to the appropriate headless mode implementation
        if (argv.minimalHeadless) {
          // Use classic headless mode for maximum compatibility
          launchOptions.args.push('--headless');
          launchOptions.headless = true;
        } else {
          // Try to detect the best headless mode
          try {
            const puppeteerVersion = require('puppeteer-extra/package.json').version;
            if (parseInt(puppeteerVersion.split('.')[0]) >= 3) {
              // New headless flag for newer versions of Puppeteer
              launchOptions.headless = 'new';
            } else {
              // Classic headless for older versions
              launchOptions.args.push('--headless');
              launchOptions.headless = true;
            }
          } catch (e) {
            // Default to new headless if version detection fails
            launchOptions.headless = 'new';
          }
        }
      }
      
      // Add proxy if available
      let proxyUrl = null;
      if (proxyList.length > 0) {
        proxyUrl = proxyList[Math.floor(Math.random() * proxyList.length)];
        launchOptions.args.push(`--proxy-server=${proxyUrl}`);
        console.log(`[Instance ${instanceId}] Using proxy: ${proxyUrl}`);
      } else if (!argv.allowDirectConnection) {
        console.error(`[Instance ${instanceId}] No proxies available and direct connections are not allowed. Stopping instance.`);
        return; // Exit the function to stop this instance
      } else {
        console.log(`[Instance ${instanceId}] No proxies available. Running with direct connection.`);
      }
      
      // Launch browser with retry logic
      let retries = 0;
      const maxRetries = 3;
      let proxyError = false;
      
      while (!browser && retries < maxRetries) {
        try {
          console.log(`[Instance ${instanceId}] Launching browser (attempt ${retries + 1}/${maxRetries})...`);
          browser = await puppeteer.launch(launchOptions);
          break; // Success, exit retry loop
        } catch (launchError) {
          retries++;
          logErrorDetails(launchError, `Browser Launch Error (Attempt ${retries})`);
          
          // Check if the error is related to proxy connection
          if (launchError.message.includes('ERR_PROXY_CONNECTION_FAILED') || 
              launchError.message.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
              launchError.message.includes('ERR_SOCKS_CONNECTION_FAILED')) {
            
            proxyError = true;
            console.error(`[Instance ${instanceId}] Proxy connection error detected. Trying without proxy...`);
            
            // Remove proxy settings
            launchOptions.args = launchOptions.args.filter(arg => !arg.startsWith('--proxy-server='));
            
            if (!argv.allowDirectConnection) {
              console.error(`[Instance ${instanceId}] Proxy connection failed and direct connection is not allowed. Stopping instance.`);
              return; // Exit the function
            }
          }
          // Additional handling for STATUS_ACCESS_VIOLATION
          else if (launchError.message.includes('STATUS_ACCESS_VIOLATION')) {
            console.error(`[Instance ${instanceId}] STATUS_ACCESS_VIOLATION detected. Applying emergency fixes...`);
            
            // Show special help for persistent STATUS_ACCESS_VIOLATION errors
            if (retries >= 2) {
              displayStatusAccessViolationHelp();
            }
            
            // This is a serious Windows-specific memory access error
            // Apply multiple fixes to recover
            
            // 1. Enable Windows-specific safe mode
            console.log(`[Instance ${instanceId}] Enabling Windows safe mode...`);
            
            // Clear existing args that might conflict with safe mode
            launchOptions.args = launchOptions.args.filter(arg => 
              !arg.includes('--disable-features=') && 
              !arg.includes('--enable-features=') && 
              !arg.includes('--headless')
            );
            
            // Add safe mode flags for Windows
            launchOptions.args.push('--no-sandbox');
            launchOptions.args.push('--disable-setuid-sandbox');
            launchOptions.args.push('--disable-gpu');
            launchOptions.args.push('--disable-gpu-sandbox');
            launchOptions.args.push('--disable-software-rasterizer');
            launchOptions.args.push('--disable-dev-shm-usage');
            launchOptions.args.push('--disable-accelerated-2d-canvas');
            
            // Extreme fixes for persistent STATUS_ACCESS_VIOLATION
            console.log(`[Instance ${instanceId}] Applying extreme fixes for persistent crashes...`);
            launchOptions.args.push('--renderer-process-limit=1');
            launchOptions.args.push('--disable-features=CalculateNativeWinOcclusion');
            launchOptions.args.push('--disable-reading-from-canvas');
            launchOptions.args.push('--disable-databases');
            launchOptions.args.push('--disable-gpu-compositing');
            launchOptions.args.push('--no-default-browser-check');
            launchOptions.args.push('--no-experiments');
            launchOptions.args.push('--no-pings');
            
            // Single process is high risk but can fix ACCESS_VIOLATION
            if (retries >= 2) {
              console.log(`[Instance ${instanceId}] Last attempt - using single-process mode (extreme/risky fix)...`);
              launchOptions.args.push('--single-process');
            }
            
            // 2. Try without headless mode if in headless mode
            if (launchOptions.headless) {
              console.log(`[Instance ${instanceId}] Switching to non-headless mode to avoid ACCESS_VIOLATION...`);
              launchOptions.headless = false;
              launchOptions.args = launchOptions.args.filter(arg => !arg.includes('--headless'));
            }
            
            // 3. Try without a custom path on next attempt
            if (launchOptions.executablePath && retries >= 1) {
              console.log(`[Instance ${instanceId}] Using bundled Chromium to avoid ACCESS_VIOLATION issues...`);
              launchOptions.executablePath = null;
            }
            
            // 4. Add more memory headroom
            launchOptions.args.push('--js-flags=--max-old-space-size=2048');
            
            // 5. Close any potentially running chrome processes (Windows specific)
            try {
              if (os.platform() === 'win32') {
                console.log(`[Instance ${instanceId}] Attempting to terminate existing Chrome processes...`);
                try {
                  execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
                } catch (e) {
                  // Ignore errors - process might not exist
                }
                try {
                  execSync('taskkill /F /IM "Google Chrome.exe" /T', { stdio: 'ignore' });
                } catch (e) {
                  // Ignore errors - process might not exist
                }
                
                // Also try to kill chromium processes
                try {
                  execSync('taskkill /F /IM chromium.exe /T', { stdio: 'ignore' });
                } catch (e) {
                  // Ignore errors - process might not exist
                }
              }
            } catch (killError) {
              // Ignore any errors in process killing
            }

            // Wait longer before retry for systems to stabilize
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
          
          if (retries >= maxRetries) {
            throw new Error(`Failed to launch browser after ${maxRetries} attempts: ${launchError.message}`);
          }
          
          // Wait before retry and try with different options if needed
          console.log(`[Instance ${instanceId}] Retrying in 5 seconds...`);
          
          // If we've tried multiple times, try with default Chromium on last attempt
          if (retries === maxRetries - 1) {
            console.log(`[Instance ${instanceId}] Trying with default bundled Chromium on final attempt...`);
            delete launchOptions.executablePath;
            
            // Also add more compatibility flags as a last resort
            console.log(`[Instance ${instanceId}] Adding additional compatibility flags...`);
            launchOptions.args.push('--disable-features=TranslateUI');
            launchOptions.args.push('--disable-breakpad');
            launchOptions.args.push('--disable-sync');
            launchOptions.args.push('--no-first-run');
            launchOptions.args.push('--password-store=basic');
          }
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    const context = browser.defaultBrowserContext();
    await context.overridePermissions('https://www.youtube.com', []);
    
    // Open a new page with error handling
    console.log(`[Instance ${instanceId}] Opening new page...`);
    const page = await browser.newPage();
    
    // Set page error handling with filtering
    page.on('error', err => {
      if (!isIgnorableError(err.message) || argv.verboseErrors) {
        console.error(`[Instance ${instanceId}] Page error: ${err.message}`);
      }
    });
    
    page.on('pageerror', err => {
      if (!isIgnorableError(err.message) || argv.verboseErrors) {
        console.error(`[Instance ${instanceId}] Page console error: ${err.message}`);
      }
    });
    
    // Handle console messages
    if (argv.verboseErrors) {
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          console.log(`[Instance ${instanceId}] Console ${msg.type()}: ${msg.text()}`);
        }
      });
    }

    // Set random user agent
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    
    // Set random viewport size
    const viewport = getRandomViewport();
    await page.setViewport(viewport);
    
    // Override problematic browser APIs
    await page.evaluateOnNewDocument((disableFingerprinting) => {
      // Handle Content Security Policy and Trusted Types
      try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
          // Create a policy for trusted HTML evaluation
          window.trustedTypes.createPolicy('youtube-viewer-policy', {
            createHTML: (string) => string,
            createScript: (string) => string,
            createScriptURL: (string) => string
          });
          
          // Add additional trusted types handling for headless mode
          const policyNames = window.trustedTypes.getPolicyNames();
          if (!policyNames.includes('default')) {
            try {
              window.trustedTypes.createPolicy('default', {
                createHTML: (string) => string,
                createScript: (string) => string,
                createScriptURL: (string) => string
              });
            } catch (e) {
              // Default policy might already exist or can't be created
              console.log('Could not create default trusted type policy: ' + e.message);
            }
          }
        }
      } catch (e) {
        // Ignore errors if policy already exists or cannot be created
        console.log('Error setting up Trusted Types policies: ' + e.message);
      }
      
      // Mock Presentation API to prevent SecurityError
      if (typeof window.PresentationRequest !== 'undefined') {
        try {
          window.PresentationRequest = class MockPresentationRequest {
            constructor() {}
            start() { return Promise.reject(new Error('Mocked PresentationRequest')); }
            reconnect() { return Promise.reject(new Error('Mocked PresentationRequest')); }
            getAvailability() { return Promise.resolve({ value: false }); }
          };
        } catch (e) {
          console.log('Could not mock PresentationRequest: ' + e.message);
        }
      }
      
      // Mock chrome.cast API to prevent cast errors
      if (typeof window.chrome === 'undefined') {
        window.chrome = {};
      }
      if (!window.chrome.cast) {
        window.chrome.cast = {
          isAvailable: false,
          initialize: function() {},
          requestSession: function() {},
          ApiConfig: function() {}
        };
      }
      
      // Mock Notification API (always do this regardless of fingerprinting setting)
      if (typeof Notification === 'undefined') {
        window.Notification = class Notification {
          static permission = 'denied';
          
          constructor() {
            // Empty constructor
          }
          
          static requestPermission() {
            return Promise.resolve('denied');
          }
          
          addEventListener() {}
          removeEventListener() {}
          dispatchEvent() { return true; }
        };
      }
      
      // Mock other problematic APIs that might be undefined (always do this)
      if (typeof speechSynthesis === 'undefined') {
        window.speechSynthesis = {
          speak: () => {},
          cancel: () => {},
          pause: () => {},
          resume: () => {},
          getVoices: () => []
        };
      }
      
      // Skip fingerprinting modifications if disabled
      if (disableFingerprinting) {
        console.log('[Browser] Fingerprinting modifications disabled');
        return;
      }
      
      // Safer approach to modify navigator properties
      try {
        // Create a proxy for navigator to intercept property access
        const navigatorProxy = new Proxy(navigator, {
          get: function(target, prop) {
            if (prop === 'hardwareConcurrency') {
              return Math.floor(Math.random() * 4) + 4;
            }
            if (prop === 'deviceMemory') {
              return Math.floor(Math.random() * 4) + 4;
            }
            return target[prop];
          }
        });
        
        // Only attempt to override navigator if it hasn't been done yet by stealth plugins
        if (Object.getOwnPropertyDescriptor(window, 'navigator').configurable) {
          Object.defineProperty(window, 'navigator', {
            value: navigatorProxy,
            configurable: false,
            writable: false
          });
        }
      } catch (e) {
        console.log('Could not modify navigator properties: ' + e.message);
      }
      
      // Override battery API more safely
      if (navigator.getBattery) {
        try {
          const originalGetBattery = navigator.getBattery;
          navigator.getBattery = function() {
            try {
              return Promise.resolve({
                charging: Math.random() > 0.5,
                chargingTime: Math.floor(Math.random() * 3600),
                dischargingTime: Math.floor(Math.random() * 7200),
                level: Math.random()
              });
            } catch (e) {
              // If our override fails, call original
              return originalGetBattery.apply(navigator);
            }
          };
        } catch (e) {
          console.log('Could not override getBattery: ' + e.message);
        }
      }
      
      // Override WebGL fingerprint with safer approach
      try {
        const getParameterProxy = function(original) {
          return function(parameter) {
            if (parameter === 37445) {
              return 'Intel Open Source Technology Center';
            }
            if (parameter === 37446) {
              return 'Mesa DRI Intel(R) HD Graphics (Skylake GT2)';
            }
            return original.apply(this, arguments);
          };
        };
        
        if (WebGLRenderingContext.prototype.getParameter) {
          const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = getParameterProxy(originalGetParameter);
        }
      } catch (e) {
        console.log('Could not override WebGL: ' + e.message);
      }
    }, argv.disableFingerprinting);
    
    console.log(`[Instance ${instanceId}] Configured with:
      - User Agent: ${userAgent.slice(0, 50)}...
      - Viewport: ${viewport.width}x${viewport.height}`);
    
    // Randomize browser fingerprint
    await page.evaluateOnNewDocument(() => {
      // Override WebGL fingerprint
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Open Source Technology Center';
        }
        if (parameter === 37446) {
          return 'Mesa DRI Intel(R) HD Graphics (Skylake GT2)';
        }
        return getParameter.apply(this, arguments);
      };
      
      // Override navigator properties
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => Math.floor(Math.random() * 4) + 4
      });
      
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => Math.floor(Math.random() * 4) + 4
      });
      
      // Override battery API
      if (navigator.getBattery) {
        navigator.getBattery = function() {
          return Promise.resolve({
            charging: Math.random() > 0.5,
            chargingTime: Math.floor(Math.random() * 3600),
            dischargingTime: Math.floor(Math.random() * 7200),
            level: Math.random()
          });
        };
      }
    });

    // Random initial delay to stagger launches
    await randomDelay(1000, 5000);
    
    let videosToWatch = [];
    const maxVideosToWatch = argv.maxVideos;
    let videoIndex = 0;
    
    // Channel browsing mode or single video mode
    if (argv.browseChannel || isChannelUrl(argv.url)) {
      let channelUrl = argv.url;
      
      // If it's a video URL but browseChannel is enabled, extract the channel
      if (!isChannelUrl(channelUrl) && channelUrl.includes('watch?v=')) {
        console.log(`[Instance ${instanceId}] Video URL provided with channel browsing enabled. Will extract channel from video.`);
        
        try {
          // Navigate to the video page with retries
          await navigateWithRetries(page, channelUrl, instanceId);
          
          // Wait for and click on the channel name to go to channel page
          await page.waitForSelector('a.ytd-channel-name', { timeout: 30000 });
          channelUrl = await page.evaluate(() => {
            const channelLink = document.querySelector('a.ytd-channel-name');
            return channelLink ? channelLink.href : null;
          });
          
          if (!channelUrl) {
            console.log(`[Instance ${instanceId}] Couldn't extract channel URL. Falling back to video URL.`);
            videosToWatch.push({ url: argv.url, title: 'Unknown' });
          }
        } catch (error) {
          console.log(`[Instance ${instanceId}] Error extracting channel: ${error.message}. Falling back to video URL.`);
          videosToWatch.push({ url: argv.url, title: 'Unknown' });
        }
      }
      
      // If we have a channel URL, extract videos
      if (isChannelUrl(channelUrl) && videosToWatch.length === 0) {
        console.log(`[Instance ${instanceId}] Navigating to channel: ${channelUrl}`);
        try {
          // Navigate to channel videos page with retries
          await navigateWithRetries(page, channelUrl + '/videos', instanceId);
          
          // Extract videos from channel page
          const channelVideos = await extractVideosFromChannel(page);
          
          console.log(`[Instance ${instanceId}] Found ${channelVideos.length} videos on the channel.`);
          
          // Filter out already watched videos
          videosToWatch = channelVideos.filter(video => 
            !globalWatchedVideos.has(video.url) && !instanceWatchedVideos.has(video.url)
          );
          
          // Shuffle the videos for random order
          videosToWatch = videosToWatch.sort(() => Math.random() - 0.5);
          
          // Limit to max videos
          videosToWatch = videosToWatch.slice(0, maxVideosToWatch);
          
          console.log(`[Instance ${instanceId}] Selected ${videosToWatch.length} videos to watch.`);
        } catch (error) {
          console.error(`[Instance ${instanceId}] Error navigating to channel: ${error.message}`);
          return; // Exit this instance if we can't navigate to the channel
        }
      }
    } else {
      // Single video mode
      videosToWatch.push({ url: argv.url, title: 'Single Video' });
    }
    
    // If no videos were found or all have been watched, exit
    if (videosToWatch.length === 0) {
      console.log(`[Instance ${instanceId}] No unwatched videos found. Exiting.`);
      return;
    }
    
    // Watch each video in sequence
    for (videoIndex = 0; videoIndex < videosToWatch.length; videoIndex++) {
      const currentVideo = videosToWatch[videoIndex];
      const videoUrl = currentVideo.url;
      const videoTitle = currentVideo.title;
      
      // Skip if video was already watched by another instance during this run
      if (globalWatchedVideos.has(videoUrl)) {
        console.log(`[Instance ${instanceId}] Skipping already watched video: ${videoTitle}`);
        continue;
      }
      
      // Mark as watched
      globalWatchedVideos.add(videoUrl);
      instanceWatchedVideos.add(videoUrl);
      
      console.log(`\n[Instance ${instanceId}] ▶️ Now playing (${videoIndex + 1}/${videosToWatch.length}): ${videoTitle}`);
      console.log(`[Instance ${instanceId}] 🔗 URL: ${videoUrl}`);
      
      // Display video type if available
      if (currentVideo.type) {
        const typeEmoji = currentVideo.type === 'short' ? '📱' : (currentVideo.type === 'live' ? '🔴' : '🎬');
        console.log(`[Instance ${instanceId}] ${typeEmoji} Type: ${currentVideo.type.toUpperCase()}`);
      }
      
      // Navigate to video with resilient navigation
      try {
        await navigateWithRetries(page, videoUrl, instanceId);
      } catch (navigationError) {
        console.error(`[Instance ${instanceId}] Failed to navigate to video after retries. Skipping to next video.`);
        continue; // Skip to the next video
      }
      
      // Wait for video player to load with better error handling
      try {
        console.log(`[Instance ${instanceId}] Waiting for video player...`);
        await page.waitForSelector('.html5-video-container', { timeout: 30000 });
      } catch (selectorError) {
        console.error(`[Instance ${instanceId}] Error finding video player: ${selectorError.message}`);
        
        // Try an alternative selector
        try {
          console.log(`[Instance ${instanceId}] Trying alternative video player selector...`);
          await page.waitForSelector('video', { timeout: 10000 });
        } catch (altSelectorError) {
          // Try one more different approach - wait for any video element
          console.log(`[Instance ${instanceId}] Checking if page has any video element...`);
          const hasVideo = await safeEvaluate(page, () => {
            return document.querySelector('video') !== null;
          });
          
          if (!hasVideo) {
            console.error(`[Instance ${instanceId}] Could not find any video element on the page. Skipping to next video.`);
            continue; // Skip to next video
          } else {
            console.log(`[Instance ${instanceId}] Found video element with alternative method.`);
          }
        }
      }
      
      // Get actual video title from the page
      const actualTitle = await page.evaluate(() => {
        const titleElement = document.querySelector('h1.ytd-watch-metadata, h1.title');
        return titleElement ? titleElement.textContent.trim() : 'Unknown Title';
      });
      
      console.log(`[Instance ${instanceId}] 📺 Actual Title: ${actualTitle}`);
      
      // Handle cookie consent if it appears
      try {
        const consentButton = await page.$('button.VfPpkd-LgbsSe');
        if (consentButton) {
          await consentButton.click();
          await randomDelay(1000, 2000);
        }
      } catch (error) {
        // Ignore consent handling errors
      }
      
      // Detect video duration
      const videoDuration = await getVideoDuration(page, instanceId);
      
      // Get video type, defaulting to regular if not specified
      const videoType = currentVideo.type || 'regular';
      
      // Generate random behavior for this video based on video duration and type
      const behavior = getRandomBehavior(videoDuration, instanceId, videoType);
      
      console.log(`[Instance ${instanceId}] ⏱️ Watch duration: ${behavior.watchDuration}s ${videoDuration ? `(Video length: ${Math.floor(videoDuration)}s)` : ''}`);
      
      // Set up ad detection and skipping
      adCheckInterval = await setupAdSkipping(page, instanceId);
      
      // Set up playback error monitoring
      playbackCheckInterval = await setupPlaybackMonitor(page, instanceId);
      
      // Play video if not already playing
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video && video.paused) {
          video.play();
        }
      });
      
      // Set random volume
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          video.volume = Math.random() * 0.3; // Low volume between 0-30%
          video.muted = false;
        }
      });
      
      // Monitor and interact with the video
      let elapsed = 0;
      const interactionInterval = setInterval(async () => {
        try {
          if (elapsed >= behavior.watchDuration) {
            clearInterval(interactionInterval);
            return;
          }
          
          elapsed += 5;
          console.log(`[Instance ${instanceId}] Watching... ${elapsed}/${behavior.watchDuration}s`);
          
          // Randomly perform interactions based on behavior profile
          if (Math.random() < behavior.scrollProbability) {
            console.log(`[Instance ${instanceId}] Scrolling slightly...`);
            await page.evaluate(() => {
              try {
                window.scrollBy(0, (Math.random() * 400) - 200);
              } catch (e) {
                // Ignore scrolling errors
              }
            });
            await randomDelay(500, 2000);
          }
          
          if (Math.random() < behavior.volumeChangeProbability) {
            console.log(`[Instance ${instanceId}] Adjusting volume...`);
            await page.evaluate(() => {
              try {
                const video = document.querySelector('video');
                if (video) {
                  video.volume = Math.min(Math.max(video.volume + (Math.random() * 0.2 - 0.1), 0), 0.5);
                }
              } catch (e) {
                // Ignore volume errors
              }
            });
          }
          
          if (Math.random() < behavior.pausePlayProbability) {
            console.log(`[Instance ${instanceId}] Toggling pause/play...`);
            await page.evaluate(() => {
              try {
                const video = document.querySelector('video');
                if (video) {
                  if (video.paused) {
                    video.play().catch(() => {});
                  } else {
                    video.pause();
                    setTimeout(() => video.play().catch(() => {}), 1000 + Math.random() * 2000);
                  }
                }
              } catch (e) {
                // Ignore pause/play errors
              }
            });
            await randomDelay(1000, 3000);
          }
          
          if (Math.random() < behavior.commentScrollProbability) {
            console.log(`[Instance ${instanceId}] Scrolling comments...`);
            await page.evaluate(() => {
              try {
                const commentsSection = document.querySelector('#comments');
                if (commentsSection) {
                  commentsSection.scrollIntoView({ behavior: 'smooth' });
                  setTimeout(() => {
                    try {
                      window.scrollBy(0, Math.random() * 300);
                    } catch (e) {
                      // Ignore scrolling errors
                    }
                  }, 1000);
                }
              } catch (e) {
                // Ignore comment scrolling errors
              }
            });
            await randomDelay(2000, 5000);
            
            // Scroll back to video after viewing comments
            await page.evaluate(() => {
              try {
                const videoPlayer = document.querySelector('.html5-video-container');
                if (videoPlayer) {
                  videoPlayer.scrollIntoView({ behavior: 'smooth' });
                }
              } catch (e) {
                // Ignore scrolling errors
              }
            });
          }
        } catch (error) {
          console.error(`[Instance ${instanceId}] Interaction error:`, error.message);
        }
      }, 5000);
      
      // Wait for the watch duration
      await new Promise(resolve => {
        setTimeout(resolve, behavior.watchDuration * 1000);
      });
      
      // Clear the interval if it's still running
      clearInterval(interactionInterval);
      
      if (adCheckInterval) {
        clearInterval(adCheckInterval);
      }
      
      if (playbackCheckInterval) {
        clearInterval(playbackCheckInterval);
      }
      
      console.log(`[Instance ${instanceId}] ✅ Finished watching: ${actualTitle}`);
      
      // Add a delay between videos
      if (videoIndex < videosToWatch.length - 1) {
        const delayBetweenVideos = Math.floor(3000 + Math.random() * 7000);
        console.log(`[Instance ${instanceId}] Waiting between videos: ${delayBetweenVideos}ms`);
        await randomDelay(delayBetweenVideos, delayBetweenVideos + 5000);
      }
    }
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error running YouTube viewer:`, error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Main function to run the YouTube viewer instances
async function runYouTubeViewers() {
  try {
    const proxyList = await setupProxies();
    const instances = argv.instances;
    
    console.log(`Starting ${instances} YouTube viewer instances...`);
    
    const promises = [];
    for (let i = 0; i < instances; i++) {
      promises.push(runYouTubeViewer(i + 1, proxyList));
    }
    
    await Promise.all(promises);
  } catch (error) {
    console.error('Error running YouTube viewers:', error.message);
  }
}

// Run the main function
runYouTubeViewers();