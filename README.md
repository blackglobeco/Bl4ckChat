# bitchat web

> [!WARNING]
> BitChat Web is experimental software with limitations due to Web Bluetooth API constraints. Private messaging is unreliable, and mesh networking is limited compared to native apps. Use for testing and basic communication only.

A web-based implementation of the BitChat decentralized Bluetooth mesh messaging app. No internet required, no servers, no phone numbers. Cross-platform compatible with native BitChat apps.

## License

This project is released into the public domain. See the [LICENSE](./LICENSE) file for details.

## Features

- **Cross-Platform Messaging**: Communicate with native BitChat apps (iOS/macOS/Android)
- **Public Chat**: Send and receive messages in the mesh network
- **Channel Support**: Join and participate in channels with `/j #channel`
- **IRC-Style Commands**: Familiar `/who`, `/join`, `/clear` interface
- **Real-time Peer Discovery**: See online users and their nicknames
- **Binary Protocol Compatibility**: Full compatibility with native BitChat protocol
- **Terminal-Inspired UI**: Clean, responsive interface optimized for web
- **Message Fragmentation**: Automatic handling of large messages

## Web Bluetooth Limitations

### What Works

- ✅ Public messaging across all platforms
- ✅ Channel-based group chat
- ✅ Cross-platform peer discovery
- ✅ IRC-style commands (`/w`, `/j`, `/help`)
- ✅ Real-time message delivery

### Limitations

- ⚠️ **Private messaging**: Unreliable due to Web Bluetooth connection limits
- ⚠️ **Limited mesh**: Only 1-2 simultaneous connections vs unlimited on native
- ⚠️ **Browser dependency**: Must keep tab active, no background operation
- ⚠️ **Browser support**: Chrome/Edge only (no Firefox/Safari)
- ❌ **Advanced mesh**: Limited multi-hop routing

## Setup

### Prerequisites

- Chrome/Chromium 56+ or Edge 79+ (Web Bluetooth required)
- Bluetooth-enabled device
- Node.js LTS

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/ervan0707/bitchat-web
   cd bitchat/web
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start development server:

   ```bash
   npm run dev
   ```

4. Open in browser:
   - Local: `http://localhost:5173`
   - Network: `http://your-ip:3000`

## Usage

### Getting Connected

1. **Enable Bluetooth** on your device
2. **Open the web app** in a supported browser
3. **Click "Connect to BitChat Network"**
4. **Select a nearby BitChat device** from the discovery list
5. **Start chatting** - you're now part of the mesh!

### Basic Commands

- `/w` or `/who` - List online users
- `/j #channel` - Join or create a channel
- `/help` - Show available commands
- `/clear` - Clear message history

## Tested Compatibility

### ✅ Successfully Tested With:

- **BitChat iOS/macOS** - Native Apple apps
- **BitChat Android** - Native Android app
- **BitChat Terminal** - Command-line version

### Test Results:

- **Public messaging**: Messages appear on all platforms
- **Channel communication**: Web users can join and participate
- **Peer discovery**: Web client visible in peer lists
- **Command compatibility**: IRC-style commands work cross-platform

## Technical Architecture

### Web Bluetooth Integration

BitChat Web uses the Web Bluetooth API to connect with native BitChat devices:

- **Service UUID**: `f47b5e2d-4a9e-4c5a-9b3f-8e1d2c3a4b5c`
- **Characteristic UUID**: `a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d`
- **Binary protocol**: Compatible with native BitChat packet structure

## Original Projects

The Bitchat WEB implementation is based on the original Bitchat projects:

- bitchat by [@jackjackbits] (https://github.com/jackjackbits)
- bitchat-android by [@callebtc] (https://github.com/callebtc)
- bitchat-terminal by [@ShilohEye] (https://github.com/ShilohEye/bitchat-terminal)
