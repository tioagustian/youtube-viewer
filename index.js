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
      // Windows paths
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome SxS\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Chromium\\Application\\chrome.exe',
        process.env.USERPROFILE + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
      ];
      
      for (const path of possiblePaths) {
        if (path && fs.existsSync(path)) {
          chromePath = path;
          break;
        }
      }
    } else if (platform === 'linux') {
      // Linux - use which command
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
      // MacOS paths
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
      console.log(`Detected Chrome at: ${chromePath}`);
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
  'Permission denied'
];

// Helper function to check if an error can be ignored
function isIgnorableError(errorMessage) {
  if (!argv.ignoreErrors) return false;
  
  return ignorableErrors.some(errText => 
    errorMessage.toLowerCase().includes(errText.toLowerCase())
  );
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
    // Try to get the video duration
    const duration = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Initial check
        const checkDuration = () => {
          const video = document.querySelector('video');
          if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
            resolve(video.duration);
          } else {
            // Check again in 1 second
            setTimeout(checkDuration, 1000);
          }
        };
        
        // Start checking
        checkDuration();
        
        // Fallback - if we haven't found duration after 20 seconds, try alternative method
        setTimeout(() => {
          const durationText = document.querySelector('.ytp-time-duration')?.textContent;
          if (durationText) {
            // Parse mm:ss or hh:mm:ss format
            const parts = durationText.split(':').map(Number);
            if (parts.length === 2) { // mm:ss
              resolve(parts[0] * 60 + parts[1]);
            } else if (parts.length === 3) { // hh:mm:ss
              resolve(parts[0] * 3600 + parts[1] * 60 + parts[2]);
            } else {
              resolve(null); // Couldn't parse
            }
          } else {
            resolve(null); // Couldn't find duration element
          }
        }, 20000);
      });
    });
    
    if (duration && duration > 0) {
      console.log(`[Instance ${instanceId}] 🕒 Video duration detected: ${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s`);
      return duration;
    } else {
      console.log(`[Instance ${instanceId}] ⚠️ Could not detect video duration`);
      return null;
    }
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error getting video duration:`, error.message);
    return null;
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
  const delay = Math.floor(min + Math.random() * (max - min));
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Function to check if URL is a channel
function isChannelUrl(url) {
  return url.includes('/channel/') || 
         url.includes('/c/') || 
         url.includes('/user/') || 
         url.includes('/@');
}

// Function to extract videos from a channel page
async function extractVideosFromChannel(page, maxVideos = 20) {
  console.log(`Extracting videos from channel...`);
  
  // Track all found videos with their types
  const allVideos = [];
  
  // Function to extract videos from current page
  async function extractCurrentPageVideos() {
    // Extract video information (URLs and titles)
    return await page.evaluate(() => {
      const videoElements = document.querySelectorAll('a#video-title-link, a#video-title, a[href*="/watch?v="]');
      const results = [];
      
      videoElements.forEach(element => {
        const href = element.href;
        const title = element.getAttribute('title') || element.textContent.trim();
        
        if (href && href.includes('/watch?v=')) {
          // Determine video type based on containers or other indicators
          let videoType = 'regular';
          
          // Check if it's a short or live
          if (href.includes('/shorts/') || 
              element.closest('[title*="short"]') || 
              element.closest('[class*="short"]') ||
              element.closest('[id*="shorts"]')) {
            videoType = 'short';
          } else if (element.querySelector('[class*="live"]') || 
                     element.closest('[class*="live"]') ||
                     title.toLowerCase().includes('live') ||
                     element.closest('[class*="badge-style-type-live"]')) {
            videoType = 'live';
          }
          
          results.push({
            url: href,
            title: title,
            type: videoType
          });
        }
      });
      
      return results;
    });
  }
  
  // Extract from Videos tab
  console.log('Looking for videos in Videos tab...');
  try {
    // Navigate to Videos tab
    const videosTabUrl = new URL(await page.url());
    if (!videosTabUrl.pathname.endsWith('/videos')) {
      videosTabUrl.pathname = videosTabUrl.pathname.replace(/\/$/, '') + '/videos';
      await page.goto(videosTabUrl.toString(), { waitUntil: 'networkidle2', timeout: 30000 });
    }
    
    // Scroll down to load more videos
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 3);
      });
      await randomDelay(1000, 2000);
    }
    
    const regularVideos = await extractCurrentPageVideos();
    console.log(`Found ${regularVideos.length} videos in Videos tab`);
    allVideos.push(...regularVideos.map(v => ({ ...v, type: 'regular' })));
  } catch (error) {
    console.error(`Error extracting from Videos tab: ${error.message}`);
  }
  
  // Extract from Shorts tab
  console.log('Looking for videos in Shorts tab...');
  try {
    // Navigate to Shorts tab
    const shortsTabUrl = new URL(await page.url());
    shortsTabUrl.pathname = shortsTabUrl.pathname.replace(/\/videos\/?$/, '').replace(/\/$/, '') + '/shorts';
    await page.goto(shortsTabUrl.toString(), { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Scroll down to load more shorts
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 3);
      });
      await randomDelay(1000, 2000);
    }
    
    const shorts = await extractCurrentPageVideos();
    console.log(`Found ${shorts.length} videos in Shorts tab`);
    allVideos.push(...shorts.map(v => ({ ...v, type: 'short' })));
  } catch (error) {
    console.error(`Error extracting from Shorts tab: ${error.message}`);
  }
  
  // Extract from Live tab
  console.log('Looking for videos in Live tab...');
  try {
    // Navigate to Live tab
    const liveTabUrl = new URL(await page.url());
    liveTabUrl.pathname = liveTabUrl.pathname.replace(/\/shorts\/?$/, '').replace(/\/$/, '') + '/streams';
    await page.goto(liveTabUrl.toString(), { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Scroll down to load more streams
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 3);
      });
      await randomDelay(1000, 2000);
    }
    
    const liveVideos = await extractCurrentPageVideos();
    console.log(`Found ${liveVideos.length} videos in Live tab`);
    allVideos.push(...liveVideos.map(v => ({ ...v, type: 'live' })));
  } catch (error) {
    console.error(`Error extracting from Live tab: ${error.message}`);
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
    // Check if ad is playing by looking for skip ad button or ad overlay
    const isAdPlaying = await page.evaluate(() => {
      // Common ad indicators
      const skipButton = document.querySelector('.ytp-ad-skip-button-container, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
      const adOverlay = document.querySelector('.ytp-ad-player-overlay, .video-ads, .ytp-ad-text');
      const adText = document.querySelector('.ytp-ad-text, .ytp-ad-preview-text');
      
      // More specific ad indicators to reduce false positives
      const adBadge = document.querySelector('.ytp-ad-button-text, .ytp-ad-visit-advertiser-button');
      const adIndicator = document.querySelector('.ad-showing');
      
      // Some ads have countdown indicators
      const adCountdown = document.querySelector('.ytp-ad-duration-remaining');
      
      // Require at least two indicators to confirm it's really an ad to avoid false positives
      let adSignalsCount = 0;
      if (skipButton) adSignalsCount++;
      if (adOverlay) adSignalsCount++;
      if (adText) adSignalsCount++;
      if (adBadge) adSignalsCount++;
      if (adIndicator) adSignalsCount++;
      if (adCountdown) adSignalsCount++;
      
      // Require at least one primary indicator (skipButton, adOverlay, adIndicator) and one secondary
      // or at least two primary indicators to reduce false positives
      return (adSignalsCount >= 2) && (skipButton || adOverlay || adIndicator);
    });
    
    if (isAdPlaying) {
      console.log(`[Instance ${instanceId}] 🔍 Advertisement detected...`);
      
      // Try to skip the ad if possible
      const wasSkipped = await page.evaluate(() => {
        // Try to click any skip button that might be available
        const skipButtons = [
          '.ytp-ad-skip-button-container button',
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.videoAdUiSkipButton',
          '[class*="skip"][class*="button"]',
          '[class*="skipButton"]',
          '[data-skip-ad]',
          '[aria-label*="Skip"]'
        ];
        
        // Try each type of skip button
        for (const selector of skipButtons) {
          const button = document.querySelector(selector);
          if (button && button.offsetParent !== null) { // Check if visible
            button.click();
            return true;
          }
        }
        
        // If can't skip, try to mute it
        const muteButton = document.querySelector('.ytp-mute-button');
        if (muteButton) {
          const isMuted = muteButton.getAttribute('aria-label').toLowerCase().includes('unmute');
          if (!isMuted) {
            muteButton.click();
            return false; // Not skipped, but muted
          }
        }
        
        return false; // Couldn't skip or already muted
      });
      
      if (wasSkipped) {
        console.log(`[Instance ${instanceId}] ⏭️ Advertisement skipped!`);
      } else {
        console.log(`[Instance ${instanceId}] 🔇 Advertisement could not be skipped - muted instead`);
        
        // If we couldn't skip, wait a bit and try again
        await randomDelay(2000, 3000);
        
        // Try clicking skip button again after a delay
        const retrySkip = await page.evaluate(() => {
          const skipButton = document.querySelector('.ytp-ad-skip-button-container button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
          if (skipButton && skipButton.offsetParent !== null) {
            skipButton.click();
            return true;
          }
          return false;
        });
        
        if (retrySkip) {
          console.log(`[Instance ${instanceId}] ⏭️ Advertisement skipped on second attempt!`);
        } else {
          // If still can't skip, just wait for the ad to finish
          console.log(`[Instance ${instanceId}] ⏱️ Waiting for advertisement to finish...`);
          
          // Some ads have a small "i" info button we can click and then choose "stop seeing this ad"
          const closedAd = await page.evaluate(() => {
            try {
              // Try clicking the info button
              const infoButton = document.querySelector('.ytp-ad-info-dialog-mute-button, .ytp-ad-info-icon-container');
              if (infoButton) {
                infoButton.click();
                
                // Wait for dialog to appear
                setTimeout(() => {
                  // Try clicking "stop seeing this ad" or similar option
                  const stopButton = document.querySelector('[class*="stop"],[class*="feedback"],[class*="close"]');
                  if (stopButton) {
                    stopButton.click();
                    
                    // If another confirmation appears, click it too
                    setTimeout(() => {
                      const confirmButton = document.querySelector('[class*="confirm"],[class*="submit"],[class*="send"]');
                      if (confirmButton) {
                        confirmButton.click();
                      }
                    }, 500);
                    
                    return true;
                  }
                }, 500);
                
                return true;
              }
              return false;
            } catch (e) {
              return false;
            }
          });
          
          if (closedAd) {
            console.log(`[Instance ${instanceId}] 🚫 Attempted to close advertisement using feedback options`);
          }
        }
      }
      
      return true; // Ad was detected, whether or not it was skipped
    }
    
    return false; // No ad detected
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error checking for ads: ${error.message}`);
    return false;
  }
}

// Function to check and handle video playback errors
async function checkAndFixPlaybackErrors(page, instanceId) {
  try {
    // Check for various error messages
    const hasError = await page.evaluate(() => {
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
        const messageText = errorMessage.textContent.toLowerCase();
        return errorTexts.some(text => messageText.includes(text));
      }
      
      // Check for visual error indicators
      return !!errorOverlay || !!errorIcon;
    });
    
    if (hasError) {
      console.log(`[Instance ${instanceId}] 🛑 Video playback error detected. Attempting to fix...`);
      
      // Try refreshing the player
      const wasFixed = await page.evaluate(() => {
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
          await page.evaluate(() => {
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
        const isStalled = await page.evaluate(() => {
          const video = document.querySelector('video');
          if (!video) return false;
          
          // Consider video stalled if it's paused but not by user action
          // or if current time hasn't changed in a while
          return (video.paused && video.readyState >= 3) || 
                 (video.readyState < 3 && video.networkState === 2);
        });
        
        if (isStalled) {
          console.log(`[Instance ${instanceId}] 🔍 Video appears to be stalled. Attempting to resume...`);
          await page.evaluate(() => {
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

// YouTube viewer instance
async function runYouTubeViewer(instanceId, proxyList) {
  let browser = null;
  const instanceWatchedVideos = new Set();
  let adCheckInterval = null;
  let playbackCheckInterval = null;
  
  try {
    console.log(`[Instance ${instanceId}] Starting...`);
    
    // Determine Chrome path
    let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (argv.customChromePath) {
      if (fs.existsSync(argv.customChromePath)) {
        chromePath = argv.customChromePath;
        console.log(`[Instance ${instanceId}] Using custom Chrome path: ${chromePath}`);
      } else {
        console.warn(`[Instance ${instanceId}] Custom Chrome path not found: ${argv.customChromePath}`);
      }
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
    
    // Set up browser options with more robust error handling
    const launchOptions = {
      headless: argv.headless ? 'new' : false,
      executablePath: chromePath || null, // Will use bundled Chromium if null
      ignoreHTTPSErrors: true,
      dumpio: false,
      args: browserArgs
    };
    
    // Add proxy if available
    let proxySuccess = false;
    let proxyRetries = 0;
    const maxProxyRetries = 3;
    
    while (!proxySuccess && proxyRetries < maxProxyRetries) {
      try {
        if (proxyList.length > 0) {
          const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
          launchOptions.args.push(`--proxy-server=${proxy}`);
          console.log(`[Instance ${instanceId}] Using proxy: ${proxy}`);
          
          // If verification is disabled, assume proxy works
          if (!argv.verifyProxies) {
            console.log(`[Instance ${instanceId}] Proxy verification disabled. Assuming proxy works.`);
            proxySuccess = true;
            continue;
          } else {
            // Proxies have already been pre-verified in setupProxies
            // So we can assume they work
            proxySuccess = true;
            continue;
          }
        } else {
          if (argv.allowDirectConnection) {
            console.log(`[Instance ${instanceId}] No proxies available. Running with direct connection.`);
            proxySuccess = true; // No proxies to try, so continue without
          } else {
            console.error(`[Instance ${instanceId}] No proxies available and direct connections are not allowed. Stopping instance.`);
            return; // Exit the function to stop this instance
          }
        }
      } catch (error) {
        console.error(`[Instance ${instanceId}] Error setting up proxy: ${error.message}`);
        proxyRetries++;
        
        if (proxyRetries >= maxProxyRetries) {
          if (argv.allowDirectConnection) {
            console.log(`[Instance ${instanceId}] Max proxy retries reached. Continuing with direct connection.`);
            
            // Reset args to remove any proxy settings
            launchOptions.args = launchOptions.args.filter(arg => !arg.startsWith('--proxy-server='));
            break;
          } else {
            console.error(`[Instance ${instanceId}] Max proxy retries reached and direct connections are not allowed. Stopping instance.`);
            return; // Exit the function to stop this instance
          }
        }
      }
    }

    // Launch browser with retry logic (if not already launched during proxy testing)
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
          console.error(`[Instance ${instanceId}] STATUS_ACCESS_VIOLATION detected. Adjusting launch parameters...`);
          
          // Enable safe mode automatically
          if (!argv.safeMode) {
            console.log(`[Instance ${instanceId}] Enabling safe mode automatically...`);
            launchOptions.args.push('--disable-features=site-per-process');
            launchOptions.args.push('--disable-web-security');
            launchOptions.args.push('--disable-features=IsolateOrigins');
            launchOptions.args.push('--disable-site-isolation-trials');
          }
          
          // Try without a custom path on next attempt
          if (launchOptions.executablePath && retries >= 2) {
            console.log(`[Instance ${instanceId}] Trying with bundled Chromium instead of custom path...`);
            launchOptions.executablePath = null;
          }
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
        await page.goto(channelUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for and click on the channel name to go to channel page
        try {
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
        await page.goto(channelUrl + '/videos', { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Extract videos from channel page
        const channelVideos = await extractVideosFromChannel(page, maxVideosToWatch * 2);
        
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
      
      // Navigate to video
      await page.goto(videoUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      }).catch(async (err) => {
        console.error(`[Instance ${instanceId}] Navigation error: ${err.message}`);
        // Try again with different waitUntil strategy
        console.log(`[Instance ${instanceId}] Retrying navigation with different settings...`);
        try {
          await page.goto(videoUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
          });
          // Add extra wait time when using domcontentloaded
          await page.waitForTimeout(5000);
        } catch (retryErr) {
          console.error(`[Instance ${instanceId}] Retry navigation also failed: ${retryErr.message}`);
          throw retryErr; // Re-throw to be caught by outer try/catch
        }
      });
      
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
          const hasVideo = await page.evaluate(() => {
            return document.querySelector('video') !== null;
          });
          
          if (!hasVideo) {
            console.error(`[Instance ${instanceId}] Could not find any video element on the page.`);
            
            // Take a screenshot to help diagnose the issue if verbose errors enabled
            if (argv.verboseErrors) {
              try {
                const screenshotPath = `error-instance-${instanceId}-${Date.now()}.png`;
                await page.screenshot({ path: screenshotPath });
                console.log(`[Instance ${instanceId}] Error screenshot saved to ${screenshotPath}`);
              } catch (screenshotError) {
                console.error(`[Instance ${instanceId}] Could not save error screenshot: ${screenshotError.message}`);
              }
            }
            
            throw new Error('No video player found on page');
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
              window.scrollBy(0, (Math.random() * 400) - 200);
            });
            await randomDelay(500, 2000);
          }
          
          if (Math.random() < behavior.volumeChangeProbability) {
            console.log(`[Instance ${instanceId}] Adjusting volume...`);
            await page.evaluate(() => {
              const video = document.querySelector('video');
              if (video) {
                video.volume = Math.min(Math.max(video.volume + (Math.random() * 0.2 - 0.1), 0), 0.5);
              }
            });
          }
          
          if (Math.random() < behavior.pausePlayProbability) {
            console.log(`[Instance ${instanceId}] Toggling pause/play...`);
            await page.evaluate(() => {
              const video = document.querySelector('video');
              if (video) {
                if (video.paused) {
                  video.play();
                } else {
                  video.pause();
                  setTimeout(() => video.play(), 1000 + Math.random() * 2000);
                }
              }
            });
            await randomDelay(1000, 3000);
          }
          
          if (Math.random() < behavior.commentScrollProbability) {
            console.log(`[Instance ${instanceId}] Scrolling comments...`);
            await page.evaluate(() => {
              const commentsSection = document.querySelector('#comments');
              if (commentsSection) {
                commentsSection.scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => {
                  window.scrollBy(0, Math.random() * 300);
                }, 1000);
              }
            });
            await randomDelay(2000, 5000);
            
            // Scroll back to video after viewing comments
            await page.evaluate(() => {
              const videoPlayer = document.querySelector('.html5-video-container');
              if (videoPlayer) {
                videoPlayer.scrollIntoView({ behavior: 'smooth' });
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
        console.log(`[Instance ${instanceId}] Waiting ${Math.floor(delayBetweenVideos/1000)}s before next video...`);
        await randomDelay(delayBetweenVideos, delayBetweenVideos + 1000);
      }
    }
    
    console.log(`[Instance ${instanceId}] 🎉 Finished watching playlist of ${videoIndex} videos.`);
    
  } catch (error) {
    console.error(`[Instance ${instanceId}] Error:`, error.message);
  } finally {
    // Clear intervals
    if (adCheckInterval) {
      clearInterval(adCheckInterval);
    }
    
    if (playbackCheckInterval) {
      clearInterval(playbackCheckInterval);
    }
    
    // Close browser
    if (browser) {
      console.log(`[Instance ${instanceId}] Closing browser...`);
      await browser.close();
    }
  }
}

// Run multiple instances
async function main() {
  try {
    // Auto-detect problem with STATUS_ACCESS_VIOLATION from previous runs
    const autoEnableSafeMode = () => {
      if (fs.existsSync('./error.log')) {
        const errorLog = fs.readFileSync('./error.log', 'utf8');
        if (errorLog.includes('STATUS_ACCESS_VIOLATION') && !argv.safeMode) {
          console.log('⚠️ STATUS_ACCESS_VIOLATION detected in previous runs. Automatically enabling --safeMode');
          argv.safeMode = true;
        }
      }
    };
    
    // Try to auto-detect issues
    try {
      autoEnableSafeMode();
    } catch (e) {
      // Ignore errors in auto detection
    }
    
    // Detect Chrome path once before starting
    const chromePath = argv.customChromePath || findChromePath();
    if (chromePath) {
      process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
    }
    
    // Print system info
    console.log('\n======== System Information ========');
    console.log(`Platform: ${os.platform()} ${os.release()}`);
    console.log(`Architecture: ${os.arch()}`);
    console.log(`Node version: ${process.version}`);
    console.log(`Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
    console.log(`Chrome path: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'Using bundled Chromium'}`);
    console.log('====================================\n');
    
    // Setup proxy list once before starting instances
    const proxyList = await setupProxies();
    
    console.log(`
    🎬 Starting YouTube Viewer with ${argv.instances} instances
    🎯 Target: ${argv.url}
    ${argv.browseChannel || isChannelUrl(argv.url) 
      ? `📺 Mode: Channel Browsing (max ${argv.maxVideos} videos per instance)
    📊 Video types: ${argv.includeRegular ? '✅ Regular' : '❌ Regular'} | ${argv.includeShorts ? '✅ Shorts' : '❌ Shorts'} | ${argv.includeLive ? '✅ Live' : '❌ Live'}` 
      : '📺 Mode: Single Video'}
    ⏱️ Watch duration: ${argv.minDuration}-${argv.maxDuration} seconds
    🌐 Proxies: ${proxyList.length > 0 ? `${proxyList.length} proxies loaded` : 'No proxies used'}
    🖥️ Browser: ${process.env.PUPPETEER_EXECUTABLE_PATH ? 'System Chrome' : 'Bundled Chromium'}
    `);
    
    const instances = Array.from({ length: argv.instances }, (_, i) => i + 1);
    
    // Run instances with a slight delay between each
    for (const instanceId of instances) {
      runYouTubeViewer(instanceId, proxyList);
      await randomDelay(3000, 10000); // 3-10 second delay between instance launches
    }
  } catch (error) {
    logErrorDetails(error, 'Main Process Error');
    
    // Save error to file for future reference
    try {
      const errorDetails = `Error Time: ${new Date().toISOString()}\nError: ${error.message}\n${error.stack || 'No stack trace'}\n\n`;
      fs.appendFileSync('./error.log', errorDetails);
      console.error('Error details saved to error.log');
    } catch (e) {
      console.error('Could not save error details to file:', e.message);
    }
    
    console.error('Program terminated due to error. Please check the logs above for details.');
    process.exit(1);
  }
}

// Intercept unhandled errors
process.on('uncaughtException', (error) => {
  logErrorDetails(error, 'Uncaught Exception');
  console.error('An uncaught exception occurred. Program will continue but may be unstable.');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n======== Unhandled Promise Rejection ========');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('============================================\n');
  console.error('An unhandled promise rejection occurred. Program will continue but may be unstable.');
});

main(); 