# YouTube Viewer

Tool to enhance YouTube watch time without being detected as bot. This tool can run multiple viewer instances simultaneously while mimicking human behavior.

## Features

- Run up to 10 simultaneous viewer instances
- Anti-detection measures with randomized behavior
- Proxy support for IP rotation
- Automatic proxy fetching from GeoNode API
- Configurable watch durations
- Mimics realistic human viewing patterns
- No login required
- Channel browsing to watch multiple videos in sequence
- Prevents duplicate video views across instances
- Displays video title in terminal logs
- Enhanced error handling and recovery
- Automatic ad detection and skipping
- Auto-recovery from playback errors

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed (version 14 or higher)
2. Clone this repository or download the files
3. Install dependencies:

```
npm install
```

## Usage

Basic usage for single video:

```
node index.js --url https://www.youtube.com/watch?v=VIDEO_ID
```

Channel browsing mode:

```
node index.js --url https://www.youtube.com/c/CHANNEL_NAME --browseChannel --maxVideos 8
```

Using proxy API:

```
node index.js --url https://www.youtube.com/watch?v=VIDEO_ID --proxyApi
```

Fix for YouTube compatibility issues:

```
node index.js --url https://www.youtube.com/watch?v=VIDEO_ID --disableFingerprinting
```

Disable automatic ad skipping:

```
node index.js --url https://www.youtube.com/watch?v=VIDEO_ID --skipAds=false
```

With multiple options:

```
node index.js --url https://www.youtube.com/watch?v=VIDEO_ID --instances 5 --minDuration 120 --maxDuration 500 --headless false --proxyApi
```

Safe mode for handling errors:

```
node index.js --url https://www.youtube.com/watch?v=VIDEO_ID --safeMode --verboseErrors
```

### Command Line Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| --url | -u | YouTube video URL or channel URL to watch (required) | - |
| --instances | -i | Number of instances/viewers to run (1-10) | 1 |
| --minDuration | -m | Minimum watch duration in seconds | 60 |
| --maxDuration | -M | Maximum watch duration in seconds | 300 |
| --headless | -h | Run in headless mode | true |
| --browseChannel | -c | Browse channel videos instead of single video | false |
| --maxVideos | -v | Maximum number of videos to watch per instance | 5 |
| --proxyApi | -p | Use proxy API instead of proxies.txt file | false |
| --proxyApiUrl | - | URL for proxy API | http://proxylist.geonode.com/api/proxy-list?country=ID&limit=10&page=1&sort_by=lastChecked&sort_type=desc |
| --noSandbox | - | Disable Chrome sandbox for compatibility | true |
| --customChromePath | - | Provide a custom path to Chrome executable | - |
| --disableShm | - | Disable shared memory usage (fixes some crashes) | true |
| --safeMode | - | Run in safe mode for maximum compatibility | false |
| --verboseErrors | - | Show detailed error logs for debugging | false |
| --ignoreErrors | - | Ignore common non-critical browser errors | true |
| --disableFingerprinting | - | Disable browser fingerprinting (fixes YouTube errors) | false |
| --skipAds | - | Automatically detect and skip YouTube ads | true |
| --help | - | Show help | - |

## Channel Browsing

The tool can now browse a YouTube channel and watch multiple videos in sequence:

1. Provide a channel URL directly: `--url https://www.youtube.com/@ChannelName`
2. Or enable channel browsing on a video URL: `--url https://www.youtube.com/watch?v=VIDEO_ID --browseChannel`
3. Specify how many videos to watch per instance: `--maxVideos 10`

When channel browsing is enabled:
- The tool extracts videos from the channel page
- Each instance watches different videos, avoiding duplicates
- Video titles are displayed in the terminal
- The tool enforces a random delay between videos

Channel URLs can be in any of these formats:
- `https://www.youtube.com/channel/CHANNEL_ID`
- `https://www.youtube.com/c/CHANNEL_NAME`
- `https://www.youtube.com/user/USERNAME`
- `https://www.youtube.com/@HANDLE`

## Ad Handling

This tool includes a sophisticated ad detection and skipping system:

### Accurate Ad Detection

The tool uses a multi-factor approach to accurately detect YouTube ads:
- Looking for multiple ad indicators simultaneously
- Requiring at least two different ad signals to confirm an actual ad
- Using more specific selectors to reduce false positives

### Ad Skipping Methods

When an ad is detected, the tool will try these methods in sequence:
1. Click the "Skip Ad" button if available
2. If skipping isn't possible, mute the ad
3. Try clicking the skip button again after a delay
4. If still not skippable, try clicking the ad info button (ⓘ) and the "Stop seeing this ad" option
5. If all else fails, wait for the ad to finish while keeping it muted

### Ad Skipping Controls

- Ad skipping is enabled by default
- To disable ad skipping: `--skipAds=false`
- Ad detection runs every 5 seconds while a video is playing

## Video Error Recovery

The tool automatically detects and recovers from common YouTube playback errors:

### Error Detection

Monitors for common errors like:
- "Something went wrong. Refresh or try again later."
- "An error occurred. Please try again later."
- "Video unavailable" messages
- Stalled or frozen video playback

### Recovery Methods

When an error is detected, the tool tries these recovery methods:
1. Click any refresh or retry buttons in the player
2. If no buttons are available, reload the entire page
3. Wait for the player to reload and automatically resume playback
4. For stalled videos (playing but frozen), try seeking slightly and restarting

### Monitoring

- Playback error monitoring occurs every 15 seconds
- Error recovery is automatic and requires no user intervention
- Works alongside the ad detection system

## Proxy Configuration

There are two ways to use proxies with this tool:

### 1. Manual Proxy List

To use a manual list of proxies:

1. Edit the `proxies.txt` file
2. Add one proxy per line in the format: `protocol://username:password@host:port`
3. For proxies without authentication: `protocol://host:port`
4. Leave the file empty if you don't want to use proxies

### 2. Automatic Proxy API (GeoNode)

To automatically fetch proxies from GeoNode's API:

1. Use the `--proxyApi` flag to enable proxy API fetching
2. Optionally customize the API URL with `--proxyApiUrl` parameter

By default, the tool will fetch Indonesian proxies. The fetched proxies will be saved to `fetched_proxies.txt` for reference.

Example API URL: `http://proxylist.geonode.com/api/proxy-list?country=ID&limit=10&page=1&sort_by=lastChecked&sort_type=desc`

You can modify the URL parameters to change:
- `country`: Country code (e.g., ID for Indonesia, US for United States)
- `limit`: Number of proxies to fetch
- `page`: Page number for pagination
- `sort_by`: Sorting criteria (lastChecked, speed, etc.)
- `sort_type`: Sort order (asc or desc)

## Error Handling

This tool includes several options to handle and troubleshoot errors:

### Error Filtering

By default, common non-critical browser errors (like "Notification is not defined") are filtered out to keep the logs clean. You can control this with:

- `--ignoreErrors=false`: Show all errors, even non-critical ones
- `--verboseErrors`: Show detailed error logs including browser console warnings

### Debugging

For troubleshooting issues:

- `--verboseErrors`: Enables detailed logging and screenshot capturing on errors
- When `verboseErrors` is enabled, the tool will save screenshots of pages where errors occur

### Auto-Recovery

The tool includes several auto-recovery mechanisms:

- Automatic retry for failed browser launches
- Alternative navigation methods if standard navigation fails
- Multiple selectors to find video players
- Error logging to file for later analysis
- Recovery from "Something went wrong" playback errors
- Handling stalled or frozen video playback

## Troubleshooting

### TypeError: Cannot redefine property: hardwareConcurrency

If you see this error, YouTube is conflicting with our browser fingerprinting modifications. Fix with:

```
node index.js --url YOUR_URL --disableFingerprinting
```

This will only disable the fingerprinting modifications but keep the core functionality working.

### STATUS_ACCESS_VIOLATION Error

If you encounter the `STATUS_ACCESS_VIOLATION` error on Windows, try these solutions:

1. **Run in Safe Mode:**
   ```
   node index.js --url YOUR_URL --safeMode
   ```
   Safe mode disables several Chrome features for better compatibility with various systems.

2. **Specify a Custom Chrome Path:**
   ```
   node index.js --url YOUR_URL --customChromePath="C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```
   Replace the path with the actual location of Chrome on your system.

3. **Run as Administrator:**
   Try running your command prompt or terminal as Administrator.

4. **Check Antivirus Settings:**
   Temporarily disable your antivirus or add an exception for this application.

5. **Disable GPU Acceleration:**
   This is enabled by default, but you can run with these options if issues persist:
   ```
   node index.js --url YOUR_URL --safeMode --noSandbox
   ```

### "Something went wrong" YouTube Error

This error is now automatically handled by the tool. The tool will:
1. Detect the error message
2. Try to click refresh/retry buttons
3. If needed, reload the entire page
4. Resume playback automatically

No user intervention is required.

### False Ad Detection

If you're seeing false ad detection messages, this has been fixed with more accurate detection requiring multiple ad indicators to be present simultaneously.

### "Notification is not defined" Error

This error is now automatically handled by the tool, which mocks the Notification API. If you still see related errors, try:

```
node index.js --url YOUR_URL --safeMode --verboseErrors
```

This will help identify what specific errors are occurring and provide more debug information.

### Browser Launch Failures

If you have problems launching the browser:

1. **Check Chrome Installation:**
   Make sure Chrome is properly installed on your system.

2. **Update Chrome to Latest Version:**
   Update your Chrome browser to the latest version.

3. **Check System Resources:**
   Make sure your system has enough RAM and disk space.

4. **Reduce Instances:**
   Try running with fewer instances if your system has limited resources:
   ```
   node index.js --url YOUR_URL --instances 2
   ```

### Error Logs

The application creates an `error.log` file when errors occur. This file can help diagnose issues.

## Disclaimer

This tool is for educational purposes only. Use responsibly and ethically. The authors are not responsible for any misuse or violation of YouTube's terms of service.

## How it Works

This tool uses puppeteer with stealth plugins to avoid detection. Each viewer instance:

1. Uses a unique, randomized browser fingerprint
2. Has random viewport sizes and user agents
3. Mimics natural human interactions (scrolling, volume changes, etc.)
4. Has randomized watching durations
5. Can rotate through different IP addresses via proxies (manual list or API)
6. When browsing channels, avoids watching the same video twice
7. Mocks browser APIs to prevent common errors
8. Automatically detects and skips ads when they appear
9. Recovers from playback errors automatically

The behavior is randomized to appear natural, with each instance having its own behavior profile. 