// Web Bluetooth Mesh Service
// Port of the Swift BluetoothMeshService for Web Bluetooth API

import { BinaryProtocol, BitchatPacket, MessageType, SpecialRecipients, generatePeerID, hexToBytes, bytesToHex } from '../protocol/BinaryProtocol';
import { BitchatMessage, BitchatMessageCodec, generateMessageID } from '../models/BitchatMessage';

export interface BluetoothMeshDelegate {
  didReceiveMessage(message: BitchatMessage): void;
  didConnectToPeer(peerID: string): void;
  didDisconnectFromPeer(peerID: string): void;
  didUpdatePeerList(): void;
}

export class WebBluetoothMeshService {
  // BitChat Service UUID (same as iOS version, lowercase for Web Bluetooth)
  private static readonly SERVICE_UUID = 'f47b5e2d-4a9e-4c5a-9b3f-8e1d2c3a4b5c';
  private static readonly CHARACTERISTIC_UUID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

  private myPeerID: string;
  private nickname: string = '';
  private isScanning = false;


  // Connected devices
  private connectedDevices = new Map<string, BluetoothDevice>();
  private deviceCharacteristics = new Map<BluetoothDevice, BluetoothRemoteGATTCharacteristic>();
  private activePeers = new Set<string>();
  private peerNicknames = new Map<string, string>();

  // Message handling
  private processedMessages = new Set<string>();


  // Fragment reassembly - match iOS implementation exactly
  private incomingFragments = new Map<string, Map<number, Uint8Array>>();
  private fragmentMetadata = new Map<string, { originalType: number; totalFragments: number; timestamp: Date }>();
  private readonly fragmentTimeout = 30000; // 30 seconds timeout
  private readonly maxFragmentBytes = 10 * 1024 * 1024; // 10MB max
  private readonly maxConcurrentFragmentSessions = 50;

  // Delegate
  delegate?: BluetoothMeshDelegate;

  // TTL and relay
  private readonly maxTTL = 7;
  private relayProbability = 1.0;

  constructor() {
    this.myPeerID = generatePeerID();
    this.nickname = `user_${this.myPeerID.slice(0, 6)}`;

    // Check Web Bluetooth support
    if (!navigator.bluetooth) {
      console.error('Web Bluetooth is not supported in this browser');
    }

    // Clean up old fragment buffers every 30 seconds
    setInterval(() => {
      this.cleanupOldFragments();
    }, 30000);

    // Handle page lifecycle events to send LEAVE notification
    this.setupPageLifecycleHandlers();
  }

  // MARK: - Public Interface

  async startService(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not supported');
    }

    // Start scanning for devices
    await this.startScanning();

    console.log(`BitChat Web service started with peer ID: ${this.myPeerID}`);
  }

  async stopService(): Promise<void> {
    this.isScanning = false;

    // Send LEAVE notification to all connected peers before disconnecting
    if (this.connectedDevices.size > 0) {
      console.log('📤 Sending LEAVE notification to all peers before disconnect...');
      await this.sendLeaveNotification();

      // Give a short delay to ensure LEAVE message is sent
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Disconnect all devices
    for (const [peerID, device] of this.connectedDevices) {
      try {
        if (device.gatt?.connected) {
          await device.gatt.disconnect();
        }
      } catch (error) {
        console.error(`Failed to disconnect from ${peerID}:`, error);
      }
    }

    this.connectedDevices.clear();
    this.deviceCharacteristics.clear();
    this.activePeers.clear();
  }

  // MARK: - Scanning and Connection

  private async startScanning(): Promise<void> {
    if (this.isScanning) return;

    try {
      this.isScanning = true;

      // Note: Web Bluetooth requires user gesture to start scanning
      // This would typically be called from a button click
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [WebBluetoothMeshService.SERVICE_UUID] }],
        optionalServices: [WebBluetoothMeshService.SERVICE_UUID]
      });

      await this.connectToDevice(device);

    } catch (error) {
      console.error('Failed to start scanning:', error);
      this.isScanning = false;
    }
  }

  async requestDeviceConnection(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not supported');
    }

    try {
      console.log('Requesting BitChat device connection...');
      console.log('Service UUID:', WebBluetoothMeshService.SERVICE_UUID);

      // Try multiple scanning approaches for better device discovery
      let device: BluetoothDevice;

      try {
        // First try: Scan specifically for BitChat service
        device = await navigator.bluetooth.requestDevice({
          filters: [{
            services: [WebBluetoothMeshService.SERVICE_UUID]
          }],
          optionalServices: [WebBluetoothMeshService.SERVICE_UUID]
        });
      } catch (firstError) {
        console.log('Service-based scan failed, trying name-based scan...', firstError);

        try {
          // Second try: Scan for devices with BitChat-like names
          device = await navigator.bluetooth.requestDevice({
            filters: [
              { namePrefix: 'BitChat' },
              { namePrefix: 'bitchat' },
              { namePrefix: 'user_' }
            ],
            optionalServices: [WebBluetoothMeshService.SERVICE_UUID]
          });
        } catch (secondError) {
          console.log('Name-based scan failed, trying acceptAllDevices...', secondError);

          // Third try: Accept all devices (user will need to select manually)
          device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [WebBluetoothMeshService.SERVICE_UUID]
          });
        }
      }

      console.log('Found device:', device.name || 'Unknown Device', device.id);
      await this.connectToDevice(device);
    } catch (error) {
      console.error('Failed to request device:', error);
      throw error;
    }
  }

  private async connectToDevice(device: BluetoothDevice): Promise<void> {
    try {
      console.log(`Connecting to device: ${device.name || 'Unknown'}`);

      // Add disconnect handler
      device.addEventListener('gattserverdisconnected', () => {
        this.handleDeviceDisconnected(device);
      });

      // Connect to GATT server
      const server = await device.gatt!.connect();

      // Get service
      const service = await server.getPrimaryService(WebBluetoothMeshService.SERVICE_UUID);

      // Get characteristic
      const characteristic = await service.getCharacteristic(WebBluetoothMeshService.CHARACTERISTIC_UUID);

      // Setup notifications
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        this.handleCharacteristicValueChanged(event, device);
      });

      // Store references
      this.deviceCharacteristics.set(device, characteristic);

      // Generate a proper peer ID (not using device name)
      const peerID = generatePeerID();
      this.connectedDevices.set(peerID, device);
      this.activePeers.add(peerID);

      // Store device name separately if available
      if (device.name) {
        this.peerNicknames.set(peerID, device.name);
      }

      console.log(`Connected to peer: ${peerID} (device: ${device.name || 'Unknown'})`);

      // Send announcement
      await this.sendAnnouncement();

      // Notify delegate
      this.delegate?.didConnectToPeer(peerID);
      this.delegate?.didUpdatePeerList();

    } catch (error) {
      console.error('Failed to connect to device:', error);
    }
  }

  private handleDeviceDisconnected(device: BluetoothDevice): void {
    console.log(`Device disconnected: ${device.name || 'Unknown'}`);

    // Find and remove peer
    let disconnectedPeerID: string | undefined;
    for (const [peerID, dev] of this.connectedDevices) {
      if (dev === device) {
        disconnectedPeerID = peerID;
        break;
      }
    }

    if (disconnectedPeerID) {
      this.connectedDevices.delete(disconnectedPeerID);
      this.activePeers.delete(disconnectedPeerID);
      this.peerNicknames.delete(disconnectedPeerID);

      this.delegate?.didDisconnectFromPeer(disconnectedPeerID);
      this.delegate?.didUpdatePeerList();
    }

    this.deviceCharacteristics.delete(device);
  }

  // MARK: - Message Handling

  private handleCharacteristicValueChanged(event: Event, device: BluetoothDevice): void {
    console.log('📨 handleCharacteristicValueChanged called from device:', device.name || 'Unknown');
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;

    if (!value) {
      console.log('📨 No value in characteristic change event');
      return;
    }

    console.log('📨 Received data, length:', value.byteLength);
    const data = new Uint8Array(value.buffer);
    console.log('📨 Raw data:', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

    const packet = BinaryProtocol.decode(data);

    if (!packet) {
      console.error('📨 Failed to decode packet');
      return;
    }

    console.log('📨 Successfully decoded packet:', {
      type: packet.type,
      typeHex: '0x' + packet.type.toString(16),
      senderID: bytesToHex(packet.senderID),
      recipientID: packet.recipientID ? bytesToHex(packet.recipientID) : 'none',
      payloadLength: packet.payload.length
    });

    const senderID = bytesToHex(packet.senderID);

    // Don't process our own messages
    if (senderID === this.myPeerID) {
      console.log('📨 Ignoring own message');
      return;
    }

    console.log('📨 Processing packet from sender:', senderID);
    this.handleReceivedPacket(packet, senderID);
  }

  private handleReceivedPacket(packet: BitchatPacket, senderID: string): void {
    // Check TTL
    if (packet.ttl <= 0) return;

    // Check for duplicates
    const packetKey = `${senderID}-${packet.timestamp}-${bytesToHex(packet.payload.slice(0, 8))}`;
    if (this.processedMessages.has(packetKey)) {
      return;
    }
    this.processedMessages.add(packetKey);

    // Update peer info
    this.activePeers.add(senderID);    // Handle different message types
    switch (packet.type) {
      case MessageType.ANNOUNCE:
        this.handleAnnounce(packet, senderID);
        break;

      case 0x02: // Legacy keyExchange - handle as announcement for compatibility
        console.log(`Received legacy keyExchange from ${senderID}, treating as announcement`);
        this.handleAnnounce(packet, senderID);
        break;

      case MessageType.MESSAGE:
        this.handleMessage(packet, senderID);
        break;

      case MessageType.LEAVE:
        this.handleLeave(packet, senderID);
        break;

      case MessageType.DELIVERY_ACK:
        this.handleDeliveryAck(packet, senderID);
        break;

      case MessageType.READ_RECEIPT:
        this.handleReadReceipt(packet, senderID);
        break;

      case MessageType.CHANNEL_ANNOUNCE:
        this.handleChannelAnnounce(packet, senderID);
        break;

      case MessageType.NOISE_ENCRYPTED:
        this.handleNoiseEncrypted(packet, senderID);
        break;

      case MessageType.FRAGMENT_START:
        this.handleFragmentStart(packet, senderID);
        break;

      case MessageType.FRAGMENT_CONTINUE:
        this.handleFragmentContinue(packet, senderID);
        break;

      case MessageType.FRAGMENT_END:
        this.handleFragmentEnd(packet, senderID);
        break;

      case MessageType.NOISE_HANDSHAKE_INIT:
        this.handleNoiseHandshakeInit(packet, senderID);
        break;

      case MessageType.NOISE_HANDSHAKE_RESP:
        this.handleNoiseHandshakeResp(packet, senderID);
        break;

      case MessageType.NOISE_IDENTITY_ANNOUNCE:
        this.handleNoiseIdentityAnnounce(packet, senderID);
        break;

      default:
        console.log(`Unhandled message type: ${packet.type} (0x${packet.type.toString(16)})`);
    }

    // Relay message if TTL > 1
    if (packet.ttl > 1) {
      this.relayPacket(packet);
    }
  }

  private handleAnnounce(packet: BitchatPacket, senderID: string): void {
    try {
      const nickname = new TextDecoder().decode(packet.payload);

      // Validate that the nickname looks reasonable
      if (nickname.length > 100 || nickname.includes('\0') || /[^\x20-\x7E]/.test(nickname)) {
        console.warn(`Received corrupted announcement from ${senderID}, ignoring`);
        return;
      }

      console.log(`📢 Peer ${senderID} announced as: ${nickname}`);

      // Update peer nickname
      this.peerNicknames.set(senderID, nickname);

      // Make sure this peer is in our active peers list
      this.activePeers.add(senderID);

      console.log(`📢 Announcement processed for ${senderID} -> ${nickname}, active peers: ${this.activePeers.size}`);
      this.delegate?.didUpdatePeerList();
    } catch (error) {
      console.error('Failed to decode announcement:', error);
    }
  }

  private handleMessage(packet: BitchatPacket, senderID: string): void {
    console.log(`📨 handleMessage called with senderID: ${senderID}`);
    console.log(`📨 Packet recipientID:`, packet.recipientID ? bytesToHex(packet.recipientID) : 'none');
    console.log(`📨 My peer ID: ${this.myPeerID}`);

    const message = BitchatMessageCodec.fromBinaryPayload(packet.payload);
    if (!message) {
      console.error('📨 Failed to decode message');
      return;
    }

    console.log(`📨 Decoded message:`, message);
    console.log(`📨 Message isPrivate:`, message.isPrivate);

    // Check if message is for us or broadcast
    const isForUs = packet.recipientID &&
      bytesToHex(packet.recipientID) === this.myPeerID;
    const isBroadcast = packet.recipientID &&
      packet.recipientID.every((byte, index) => byte === SpecialRecipients.BROADCAST[index]) ||
      !packet.recipientID; // Also consider no recipientID as broadcast

    console.log(`📨 isForUs: ${isForUs}, isBroadcast: ${isBroadcast}`);
    console.log(`📨 Recipient check - packet recipientID: ${packet.recipientID ? bytesToHex(packet.recipientID) : 'none'}, my ID: ${this.myPeerID}`);

    if (isForUs || isBroadcast) {
      // Update message with sender peer ID
      message.senderPeerID = senderID;

      console.log(`📨 Received message from ${message.sender}: ${message.content}`);
      console.log(`📨 Calling delegate.didReceiveMessage with:`, message);

      this.delegate?.didReceiveMessage(message);
    } else {
      console.log('📨 Message not for us, ignoring');
    }
  }

  private handleLeave(_packet: BitchatPacket, senderID: string): void {
    console.log(`Peer ${senderID} left`);

    this.activePeers.delete(senderID);
    this.peerNicknames.delete(senderID);

    this.delegate?.didDisconnectFromPeer(senderID);
    this.delegate?.didUpdatePeerList();
  }

  private handleDeliveryAck(_packet: BitchatPacket, senderID: string): void {
    console.log(`Received delivery ACK from ${senderID}`);
    // TODO: Update message delivery status in UI
  }

  private handleReadReceipt(_packet: BitchatPacket, senderID: string): void {
    console.log(`Received read receipt from ${senderID}`);
    // TODO: Update message read status in UI
  }

  private handleChannelAnnounce(packet: BitchatPacket, senderID: string): void {
    console.log(`Received channel announcement from ${senderID}`);
    const payload = new TextDecoder().decode(packet.payload);
    console.log(`Channel announcement payload: ${payload}`);
    // TODO: Parse channel announcement and update UI
  }

  private handleNoiseEncrypted(_packet: BitchatPacket, senderID: string): void {
    console.log(`Received Noise encrypted message from ${senderID}`);
    // TODO: Implement Noise protocol decryption
    console.log('Noise protocol not yet implemented in web version');
  }

  // MARK: - Fragment Message Handlers

  private handleFragmentStart(packet: BitchatPacket, senderID: string): void {
    this.handleFragment(packet, senderID);
  }

  private handleFragmentContinue(packet: BitchatPacket, senderID: string): void {
    this.handleFragment(packet, senderID);
  }

  private handleFragmentEnd(packet: BitchatPacket, senderID: string): void {
    this.handleFragment(packet, senderID);
  }

  // Rewritten to match iOS implementation exactly
  private handleFragment(packet: BitchatPacket, senderID: string): void {
    console.log(`🧩 Received fragment from ${senderID}`);

    // Validate fragment has minimum required size (matches iOS)
    if (packet.payload.length < 13) {
      console.error('❌ Fragment payload too short');
      return;
    }

    try {
      // Convert to array for safer access (matches iOS)
      const payloadArray = Array.from(packet.payload);
      let offset = 0;

      // Extract fragment ID as binary data (8 bytes) - matches iOS exactly
      if (payloadArray.length < 8) {
        console.error('❌ Not enough data for fragment ID');
        return;
      }

      const fragmentIDData = new Uint8Array(payloadArray.slice(0, 8));
      const fragmentID = bytesToHex(fragmentIDData);
      offset = 8;

      // Safely extract index (matches iOS)
      if (payloadArray.length < offset + 2) {
        console.error('❌ Not enough data for index');
        return;
      }
      const index = (payloadArray[offset] << 8) | payloadArray[offset + 1];
      offset += 2;

      // Safely extract total (matches iOS)
      if (payloadArray.length < offset + 2) {
        console.error('❌ Not enough data for total');
        return;
      }
      const total = (payloadArray[offset] << 8) | payloadArray[offset + 1];
      offset += 2;

      // Safely extract original type (matches iOS)
      if (payloadArray.length < offset + 1) {
        console.error('❌ Not enough data for type');
        return;
      }
      const originalType = payloadArray[offset];
      offset += 1;

      // Extract fragment data
      const fragmentData: Uint8Array = payloadArray.length > offset ?
        new Uint8Array(payloadArray.slice(offset)) :
        new Uint8Array();

      console.log(`🧩 Fragment ${index}/${total} (type: ${originalType}, ID: ${fragmentID}, size: ${fragmentData.length})`);
      console.log(`🧩 Fragment hex: ${Array.from(fragmentData.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')}${fragmentData.length > 32 ? '...' : ''}`);

      // Debug: Log the raw payload for fragment 0
      if (index === 0) {
        console.log(`🧩 Fragment 0 full payload (${packet.payload.length} bytes):`, Array.from(packet.payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log(`🧩 Fragment header breakdown:`);
        console.log(`   FragmentID: ${fragmentID}`);
        console.log(`   Index: ${index} (bytes: ${packet.payload[8].toString(16).padStart(2, '0')} ${packet.payload[9].toString(16).padStart(2, '0')})`);
        console.log(`   Total: ${total} (bytes: ${packet.payload[10].toString(16).padStart(2, '0')} ${packet.payload[11].toString(16).padStart(2, '0')})`);
        console.log(`   OriginalType: ${originalType} (byte: ${packet.payload[12].toString(16).padStart(2, '0')})`);
        console.log(`   Data starts at offset 13, length: ${fragmentData.length}`);
      }

      // Initialize fragment collection if needed (matches iOS logic exactly)
      if (!this.incomingFragments.has(fragmentID)) {
        // Check if we've reached the concurrent session limit
        if (this.incomingFragments.size >= this.maxConcurrentFragmentSessions) {
          // Clean up oldest fragments first
          this.cleanupOldFragments();

          // If still at limit, reject new session to prevent DoS
          if (this.incomingFragments.size >= this.maxConcurrentFragmentSessions) {
            console.log('❌ Fragment session limit reached');
            return;
          }
        }

        this.incomingFragments.set(fragmentID, new Map());
        this.fragmentMetadata.set(fragmentID, {
          originalType,
          totalFragments: total,
          timestamp: new Date()
        });
      }

      const fragments = this.incomingFragments.get(fragmentID)!;
      fragments.set(index, fragmentData); console.log(`🧩 Fragment collection now has ${fragments.size}/${total} fragments`);

      // Check if we have all fragments (matches iOS exactly)
      if (fragments.size === total) {
        console.log('✅ All fragments received! Reassembling packet...');

        // Reassemble the original packet (matches iOS)
        let reassembledData = new Uint8Array();
        for (let i = 0; i < total; i++) {
          const fragment = fragments.get(i);
          if (!fragment) {
            console.error(`❌ Missing fragment ${i}`);
            return;
          }

          // Append fragment data
          const newData = new Uint8Array(reassembledData.length + fragment.length);
          newData.set(reassembledData);
          newData.set(fragment, reassembledData.length);
          reassembledData = newData;
        }

        console.log(`✅ Reassembled ${reassembledData.length} bytes`);

        // Parse and handle the reassembled packet (matches iOS)
        const reassembledPacket = BinaryProtocol.decode(reassembledData);
        if (reassembledPacket) {
          // Clean up (matches iOS)
          this.incomingFragments.delete(fragmentID);
          this.fragmentMetadata.delete(fragmentID);

          // Handle the reassembled packet (matches iOS)
          console.log(`✅ Processing reassembled packet type ${reassembledPacket.type}`);
          this.handleReceivedPacket(reassembledPacket, senderID);
        } else {
          console.error('❌ Failed to parse reassembled packet');
        }
      } else {
        // IMMEDIATE WORKAROUND: If this is fragment 0/2 and data looks complete, try to process it
        if (index === 0 && total === 2) {
          console.log('🔧 Attempting immediate processing of fragment 0/2 as Web Bluetooth may drop fragment 1...');

          // Try to decode as message payload directly
          const immediateMessage = BitchatMessageCodec.fromBinaryPayload(fragmentData);
          if (immediateMessage) {
            console.log(`🎉 SUCCESS: Fragment 0 contains complete message: "${immediateMessage.content}"`);
            immediateMessage.senderPeerID = senderID;
            this.delegate?.didReceiveMessage(immediateMessage);

            // Clean up this fragment session since we processed it
            this.incomingFragments.delete(fragmentID);
            this.fragmentMetadata.delete(fragmentID);
            return;
          }

          // Try to decode as complete packet
          const immediatePacket = BinaryProtocol.decode(fragmentData);
          if (immediatePacket && immediatePacket.type === MessageType.MESSAGE) {
            console.log(`🎉 SUCCESS: Fragment 0 contains complete packet!`);
            this.handleReceivedPacket(immediatePacket, senderID);

            // Clean up this fragment session since we processed it
            this.incomingFragments.delete(fragmentID);
            this.fragmentMetadata.delete(fragmentID);
            return;
          }

          console.log('🔧 Fragment 0 is not complete, waiting for fragment 1...');
        }

        // WORKAROUND: Web Bluetooth often drops fragments, so try to process single fragments
        console.log(`⚠️ Waiting for ${total - fragments.size} more fragments, but trying single fragment workaround...`);

        if (fragments.size === 1 && total === 2 && index === 0) {
          console.log('🔧 Attempting to process single fragment as complete message (Web Bluetooth workaround)');

          const singleFragment = fragments.get(0);
          if (singleFragment) {
            console.log(`🔧 Single fragment size: ${singleFragment.length} bytes`);
            console.log(`🔧 Fragment content (hex): ${Array.from(singleFragment).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            console.log(`🔧 Fragment content (string): ${new TextDecoder().decode(singleFragment).substring(0, 100)}...`);

            // First, try to decode it as a complete BitchatPacket (in case it's somehow complete)
            const potentialPacket = BinaryProtocol.decode(singleFragment);
            if (potentialPacket && potentialPacket.type === MessageType.MESSAGE) {
              console.log('🎉 Single fragment is actually a complete packet!');
              this.handleReceivedPacket(potentialPacket, senderID);
              this.incomingFragments.delete(fragmentID);
              this.fragmentMetadata.delete(fragmentID);
              return;
            }

            // Otherwise, try to parse it as a message payload directly
            const message = BitchatMessageCodec.fromBinaryPayload(singleFragment);
            if (message) {
              console.log(`🎉 Successfully decoded single fragment as complete message!`);
              console.log(`🎉 Message: "${message.content}" from ${message.sender}`);

              // Update message with sender peer ID
              message.senderPeerID = senderID;

              // Send to delegate
              this.delegate?.didReceiveMessage(message);

              // Clean up
              this.incomingFragments.delete(fragmentID);
              this.fragmentMetadata.delete(fragmentID);

              return;
            } else {
              console.log('🔧 Single fragment is not a complete message, will wait for more fragments');
            }
          }
        }

        // Set a timeout to clean up incomplete fragments, but also try aggressive recovery
        setTimeout(() => {
          if (this.incomingFragments.has(fragmentID)) {
            const fragments = this.incomingFragments.get(fragmentID)!;
            const metadata = this.fragmentMetadata.get(fragmentID)!;

            console.log(`⏰ Timeout: Fragment session ${fragmentID} incomplete (${fragments.size}/${metadata.totalFragments})`);

            // AGGRESSIVE RECOVERY: If we have any fragments, try to process them
            if (fragments.size > 0) {
              console.log('🚨 Attempting aggressive fragment recovery...');

              // Try to process each fragment as a potential complete message
              for (const [fragmentIndex, fragmentData] of fragments.entries()) {
                console.log(`🚨 Trying fragment ${fragmentIndex} as complete message...`);

                // Try as complete packet first
                const potentialPacket = BinaryProtocol.decode(fragmentData);
                if (potentialPacket && potentialPacket.type === MessageType.MESSAGE) {
                  console.log('🚨✅ Fragment is a complete packet! Processing...');
                  this.handleReceivedPacket(potentialPacket, senderID);
                  this.incomingFragments.delete(fragmentID);
                  this.fragmentMetadata.delete(fragmentID);
                  return;
                }

                // Try as message payload
                const message = BitchatMessageCodec.fromBinaryPayload(fragmentData);
                if (message) {
                  console.log(`🚨✅ Fragment decoded as message: "${message.content}"`);
                  message.senderPeerID = senderID;
                  this.delegate?.didReceiveMessage(message);
                  this.incomingFragments.delete(fragmentID);
                  this.fragmentMetadata.delete(fragmentID);
                  return;
                }

                // ADDITIONAL RECOVERY: Try to decode with different offsets in case there's header data
                console.log(`🚨 Trying fragment ${fragmentIndex} with different offsets...`);
                for (let offset = 1; offset <= Math.min(20, fragmentData.length - 10); offset++) {
                  const offsetData = fragmentData.slice(offset);

                  // Try as packet
                  const offsetPacket = BinaryProtocol.decode(offsetData);
                  if (offsetPacket && offsetPacket.type === MessageType.MESSAGE) {
                    console.log(`🚨✅ Fragment decoded as packet with offset ${offset}!`);
                    this.handleReceivedPacket(offsetPacket, senderID);
                    this.incomingFragments.delete(fragmentID);
                    this.fragmentMetadata.delete(fragmentID);
                    return;
                  }

                  // Try as message payload
                  const offsetMessage = BitchatMessageCodec.fromBinaryPayload(offsetData);
                  if (offsetMessage) {
                    console.log(`🚨✅ Fragment decoded as message with offset ${offset}: "${offsetMessage.content}"`);
                    offsetMessage.senderPeerID = senderID;
                    this.delegate?.didReceiveMessage(offsetMessage);
                    this.incomingFragments.delete(fragmentID);
                    this.fragmentMetadata.delete(fragmentID);
                    return;
                  }
                }
              }

              console.log('🚨❌ Aggressive recovery failed, cleaning up fragment');
            }

            console.log(`⏰ Cleaning up incomplete fragment ${fragmentID}`);
            this.incomingFragments.delete(fragmentID);
            this.fragmentMetadata.delete(fragmentID);
          }
        }, 2000); // Reduced to 2 second timeout for faster recovery
      }

      // Periodic cleanup of old fragments (matches iOS)
      this.cleanupOldFragments();

    } catch (error) {
      console.error('❌ Error handling fragment:', error);
    }
  }

  // MARK: - Fragment Cleanup (matches iOS implementation)

  private cleanupOldFragments(): void {
    const cutoffTime = new Date(Date.now() - this.fragmentTimeout);
    const fragmentsToRemove: string[] = [];

    for (const [fragID, metadata] of this.fragmentMetadata) {
      if (metadata.timestamp < cutoffTime) {
        fragmentsToRemove.push(fragID);
      }
    }

    // Remove expired fragments
    for (const fragID of fragmentsToRemove) {
      this.incomingFragments.delete(fragID);
      this.fragmentMetadata.delete(fragID);
      console.log(`🧹 Cleaned up expired fragment: ${fragID}`);
    }

    // Also enforce memory bounds - if we have too many fragment bytes, remove oldest
    let totalFragmentBytes = 0;

    for (const [, fragments] of this.incomingFragments) {
      for (const [, data] of fragments) {
        totalFragmentBytes += data.length;
      }
    }

    if (totalFragmentBytes > this.maxFragmentBytes) {
      console.log(`🧹 Fragment memory limit exceeded (${totalFragmentBytes}/${this.maxFragmentBytes}), cleaning up oldest`);

      // Sort by timestamp and remove oldest
      const sortedFragments = Array.from(this.fragmentMetadata.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

      while (totalFragmentBytes > this.maxFragmentBytes && sortedFragments.length > 0) {
        const [fragID] = sortedFragments.shift()!;
        const fragments = this.incomingFragments.get(fragID);

        if (fragments) {
          for (const [, data] of fragments) {
            totalFragmentBytes -= data.length;
          }
        }

        this.incomingFragments.delete(fragID);
        this.fragmentMetadata.delete(fragID);
        console.log(`🧹 Removed old fragment for memory: ${fragID}`);
      }
    }
  }

  // MARK: - Noise Protocol Handlers

  private handleNoiseHandshakeInit(_packet: BitchatPacket, senderID: string): void {
    console.log(`Received Noise handshake init from ${senderID}`);
    // TODO: Implement Noise protocol handshake initiation
  }

  private handleNoiseHandshakeResp(_packet: BitchatPacket, senderID: string): void {
    console.log(`Received Noise handshake response from ${senderID}`);
    // TODO: Implement Noise protocol handshake response
  }

  private handleNoiseIdentityAnnounce(_packet: BitchatPacket, senderID: string): void {
    console.log(`Received Noise identity announcement from ${senderID}`);
    // TODO: Implement Noise identity announcement processing
  }

  // MARK: - Message Sending

  async sendMessage(content: string, mentions: string[] = [], channel?: string): Promise<void> {
    console.log('📤 WebBluetoothMeshService: sendMessage called with:', { content, mentions, channel });
    console.log('📤 WebBluetoothMeshService: Connected devices:', this.connectedDevices.size);
    console.log('📤 WebBluetoothMeshService: Device characteristics:', this.deviceCharacteristics.size);

    const message: BitchatMessage = {
      id: generateMessageID(),
      sender: this.nickname,
      content,
      timestamp: new Date(),
      isRelay: false,
      isPrivate: false,
      senderPeerID: this.myPeerID,
      mentions: mentions.length > 0 ? mentions : undefined,
      channel,
      isEncrypted: false
    };

    console.log('📤 WebBluetoothMeshService: Created message:', message);

    const messageData = BitchatMessageCodec.toBinaryPayload(message);
    if (!messageData) {
      console.error('📤 WebBluetoothMeshService: Failed to encode message');
      return;
    }

    console.log('📤 WebBluetoothMeshService: Encoded message data, size:', messageData.length);

    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: this.maxTTL,
      timestamp: BigInt(Date.now()),
      senderID: hexToBytes(this.myPeerID),
      recipientID: SpecialRecipients.BROADCAST,
      payload: messageData
    };

    console.log('📤 WebBluetoothMeshService: Created packet, calling broadcastPacket...');
    await this.broadcastPacket(packet);
    console.log('📤 WebBluetoothMeshService: broadcastPacket completed');
  }

  async sendPrivateMessage(content: string, recipientPeerID: string, recipientNickname: string): Promise<void> {
    console.log('📤 sendPrivateMessage called with:', { content, recipientPeerID, recipientNickname });
    console.log('📤 My peer ID:', this.myPeerID);

    const message: BitchatMessage = {
      id: generateMessageID(),
      sender: this.nickname,
      content,
      timestamp: new Date(),
      isRelay: false,
      isPrivate: true,
      recipientNickname,
      senderPeerID: this.myPeerID,
      isEncrypted: false
    };

    console.log('📤 Created private message:', message);

    const messageData = BitchatMessageCodec.toBinaryPayload(message);
    if (!messageData) {
      console.error('Failed to encode private message');
      return;
    }

    console.log('📤 Encoded message data, size:', messageData.length);

    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: this.maxTTL,
      timestamp: BigInt(Date.now()),
      senderID: hexToBytes(this.myPeerID),
      recipientID: hexToBytes(recipientPeerID),
      payload: messageData
    };

    console.log('📤 Created packet with recipientID:', bytesToHex(packet.recipientID!));
    console.log('📤 Packet type:', packet.type, 'MessageType.MESSAGE:', MessageType.MESSAGE);

    await this.broadcastPacket(packet);
    console.log('📤 Private message sent via broadcastPacket');
  }

  private async sendAnnouncement(): Promise<void> {
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.ANNOUNCE,
      ttl: 3,
      timestamp: BigInt(Date.now()),
      senderID: hexToBytes(this.myPeerID),
      payload: new TextEncoder().encode(this.nickname)
    };

    await this.broadcastPacket(packet);
  }

  private async broadcastPacket(packet: BitchatPacket): Promise<void> {
    console.log('📤 broadcastPacket: Starting broadcast, packet type:', packet.type);
    console.log('📤 broadcastPacket: Connected devices:', this.connectedDevices.size);
    console.log('📤 broadcastPacket: Device characteristics:', this.deviceCharacteristics.size);

    const data = BinaryProtocol.encode(packet);
    if (!data) {
      console.error('📤 broadcastPacket: Failed to encode packet');
      return;
    }

    console.log('📤 broadcastPacket: Encoded packet, size:', data.length);

    // Send to all connected devices
    let sentCount = 0;
    for (const [device, characteristic] of this.deviceCharacteristics) {
      try {
        console.log('📤 broadcastPacket: Checking device:', device.name || 'Unknown', 'connected:', device.gatt?.connected);
        if (device.gatt?.connected) {
          console.log('📤 broadcastPacket: Writing to characteristic...');
          await characteristic.writeValue(data);
          sentCount++;
          console.log('📤 broadcastPacket: Successfully sent to device:', device.name || 'Unknown');
        } else {
          console.log('📤 broadcastPacket: Device not connected, skipping');
        }
      } catch (error) {
        console.error('📤 broadcastPacket: Failed to send packet to device:', device.name || 'Unknown', error);
      }
    }

    console.log('📤 broadcastPacket: Finished broadcasting to', sentCount, 'devices');
  }

  private async relayPacket(originalPacket: BitchatPacket): Promise<void> {
    // Implement probabilistic relay
    if (Math.random() > this.relayProbability) {
      return;
    }

    // Decrease TTL and relay
    const relayPacket = { ...originalPacket };
    relayPacket.ttl -= 1;

    // Add small delay to prevent collision
    setTimeout(async () => {
      await this.broadcastPacket(relayPacket);
    }, Math.random() * 100 + 50); // 50-150ms delay
  }

  private async sendLeaveNotification(): Promise<void> {
    console.log('📤 Sending LEAVE notification to mesh...');
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.LEAVE,
      ttl: 3,
      timestamp: BigInt(Date.now()),
      senderID: hexToBytes(this.myPeerID),
      payload: new TextEncoder().encode(this.nickname)
    };

    await this.broadcastPacket(packet);
  }

  // MARK: - Getters

  getMyPeerID(): string {
    return this.myPeerID;
  }

  getNickname(): string {
    return this.nickname;
  }

  setNickname(nickname: string): void {
    this.nickname = nickname;
  }

  getConnectedPeers(): string[] {
    return Array.from(this.activePeers);
  }

  getPeerNicknames(): Map<string, string> {
    return new Map(this.peerNicknames);
  }

  isBluetoothSupported(): boolean {
    return !!navigator.bluetooth;
  }

  private setupPageLifecycleHandlers(): void {
    // Handle page unload (browser close, refresh, navigation)
    window.addEventListener('beforeunload', async () => {
      console.log('📤 Page unloading, sending LEAVE notification...');
      // Send leave notification (but don't prevent page unload)
      if (this.connectedDevices.size > 0) {
        try {
          await this.sendLeaveNotification();
        } catch (error) {
          console.error('Failed to send LEAVE notification on page unload:', error);
        }
      }
    });

    // Handle visibility change (tab hidden/shown)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        console.log('📤 Page hidden, sending LEAVE notification...');
        // Send leave notification when tab becomes hidden
        if (this.connectedDevices.size > 0) {
          this.sendLeaveNotification().catch(error => {
            console.error('Failed to send LEAVE notification on visibility change:', error);
          });
        }
      }
    });

    // Handle page focus events (additional safety net)
    window.addEventListener('pagehide', () => {
      console.log('📤 Page hiding, sending LEAVE notification...');
      if (this.connectedDevices.size > 0) {
        this.sendLeaveNotification().catch(error => {
          console.error('Failed to send LEAVE notification on page hide:', error);
        });
      }
    });
  }
}
