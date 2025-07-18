import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { BitchatMessage, DeliveryStatus } from '../models/BitchatMessage';
import { WebBluetoothMeshService, BluetoothMeshDelegate } from '../services/WebBluetoothMeshService';

export interface ChatState {
  // Core state
  messages: BitchatMessage[];
  connectedPeers: string[];
  nickname: string;
  isConnected: boolean;

  // Private chats
  privateChats: Record<string, BitchatMessage[]>;
  selectedPrivateChatPeer: string | null;
  unreadPrivateMessages: Set<string>;

  // Channels
  joinedChannels: Set<string>;
  currentChannel: string | null;
  channelMessages: Record<string, BitchatMessage[]>;
  unreadChannelMessages: Record<string, number>;
  channelMembers: Record<string, Set<string>>;

  // UI state
  showPeerList: boolean;
  showSettings: boolean;
  errorMessage: string | null;

  // Peer information
  peerNicknames: Map<string, string>;

  // Bluetooth service
  bluetoothService: WebBluetoothMeshService;

  // Actions
  setNickname: (nickname: string) => void;
  addMessage: (message: BitchatMessage) => void;
  sendMessage: (content: string, mentions?: string[], channel?: string) => Promise<void>;
  sendPrivateMessage: (content: string, recipientPeerID: string, recipientNickname: string) => Promise<void>;
  joinChannel: (channel: string) => void;
  leaveChannel: (channel: string) => void;
  setCurrentChannel: (channel: string | null) => void;
  setSelectedPrivateChat: (peerID: string | null) => void;
  clearMessages: () => void;
  connectToBluetooth: () => Promise<void>;
  disconnectBluetooth: () => Promise<void>;
  updateConnectedPeers: (peers: string[]) => void;
  updatePeerNicknames: (nicknames: Map<string, string>) => void;
  togglePeerList: () => void;
  toggleSettings: () => void;
  setError: (error: string | null) => void;
  markMessagesAsRead: (peerID?: string, channel?: string) => void;
}

class ChatStateDelegate implements BluetoothMeshDelegate {
  private setState: (partial: Partial<ChatState>) => void;
  private getState: () => ChatState;

  constructor(setState: (partial: Partial<ChatState>) => void, getState: () => ChatState) {
    this.setState = setState;
    this.getState = getState;
  }

  didReceiveMessage(message: BitchatMessage): void {
    console.log('📨 didReceiveMessage called with:', message);
    console.log('📨 Message content:', message.content);
    console.log('📨 Message sender:', message.sender);
    console.log('📨 Message isPrivate:', message.isPrivate);
    console.log('📨 Message channel:', message.channel);

    const state = this.getState();
    console.log('📨 Current messages length:', state.messages.length);

    // Add to main messages array
    const newMessages = [...state.messages, message];
    console.log('📨 Updated messages array length:', newMessages.length);

    // Update channel messages if it's a channel message
    if (message.channel) {
      console.log('📨 Processing channel message for channel:', message.channel);
      const channelKey = message.channel;
      const channelMessages = state.channelMessages[channelKey] || [];
      const newChannelMessages = {
        ...state.channelMessages,
        [channelKey]: [...channelMessages, message]
      };

      // Update unread count if not current channel
      const unreadChannelMessages = { ...state.unreadChannelMessages };
      if (state.currentChannel !== channelKey) {
        unreadChannelMessages[channelKey] = (unreadChannelMessages[channelKey] || 0) + 1;
      }

      // Update channel members
      const channelMembers = { ...state.channelMembers };
      if (!channelMembers[channelKey]) {
        channelMembers[channelKey] = new Set();
      }
      channelMembers[channelKey].add(message.senderPeerID);

      console.log('📨 Updating state with channel message');
      this.setState({
        messages: newMessages,
        channelMessages: newChannelMessages,
        unreadChannelMessages,
        channelMembers
      });
      console.log('📨 Channel message state updated');
    }
    // Handle private messages
    else if (message.isPrivate) {
      console.log('📨 Processing private message');
      const peerID = message.senderPeerID;
      const privateChats = { ...state.privateChats };
      const privateChatMessages = privateChats[peerID] || [];
      privateChats[peerID] = [...privateChatMessages, message];

      // Update unread count if not currently viewing this chat
      const unreadPrivateMessages = new Set(state.unreadPrivateMessages);
      if (state.selectedPrivateChatPeer !== peerID) {
        unreadPrivateMessages.add(peerID);
      }

      console.log('📨 Updating state with private message');
      this.setState({
        messages: newMessages,
        privateChats,
        unreadPrivateMessages
      });
      console.log('📨 Private message state updated');
    }
    // Public messages
    else {
      console.log('📨 Processing public message');
      console.log('📨 About to call setState with messages array of length:', newMessages.length);

      this.setState({
        messages: newMessages
      });

      console.log('📨 setState called for public message');

      // Verify state was actually updated
      setTimeout(() => {
        const updatedState = this.getState();
        console.log('📨 Verified: Current messages length after update:', updatedState.messages.length);
        if (updatedState.messages.length > 0) {
          const lastMessage = updatedState.messages[updatedState.messages.length - 1];
          console.log('📨 Last message in array:', lastMessage);
          console.log('📨 Last message properties:', {
            id: lastMessage.id,
            content: lastMessage.content,
            sender: lastMessage.sender,
            isPrivate: lastMessage.isPrivate,
            channel: lastMessage.channel,
            senderPeerID: lastMessage.senderPeerID
          });
        }
      }, 100);
    }

    // Update delivery status for own messages
    if (message.senderPeerID !== state.bluetoothService.getMyPeerID()) {
      // This is someone else's message, mark as delivered
      message.deliveryStatus = DeliveryStatus.DELIVERED;
    }
  }

  didConnectToPeer(peerID: string): void {
    const state = this.getState();
    if (!state.connectedPeers.includes(peerID)) {
      this.setState({
        connectedPeers: [...state.connectedPeers, peerID],
        isConnected: true
      });
    }
  }

  didDisconnectFromPeer(peerID: string): void {
    const state = this.getState();
    this.setState({
      connectedPeers: state.connectedPeers.filter(id => id !== peerID),
      isConnected: state.connectedPeers.length > 1
    });
  }

  didUpdatePeerList(): void {
    const state = this.getState();
    const peers = state.bluetoothService.getConnectedPeers();
    const nicknames = state.bluetoothService.getPeerNicknames();

    this.setState({
      connectedPeers: peers,
      peerNicknames: nicknames,
      isConnected: peers.length > 0
    });
  }
}

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => {
    const bluetoothService = new WebBluetoothMeshService();
    const delegate = new ChatStateDelegate(set, get);
    bluetoothService.delegate = delegate;

    return {
      // Initial state
      messages: [],
      connectedPeers: [],
      nickname: bluetoothService.getNickname(),
      isConnected: false,
      privateChats: {},
      selectedPrivateChatPeer: null,
      unreadPrivateMessages: new Set(),
      joinedChannels: new Set(['#general']),
      currentChannel: null, // null = Public chat
      channelMessages: {},
      unreadChannelMessages: {},
      channelMembers: {},
      showPeerList: false,
      showSettings: false,
      errorMessage: null,
      peerNicknames: new Map(),
      bluetoothService,

      // Actions
      setNickname: (nickname: string) => {
        bluetoothService.setNickname(nickname);
        set({ nickname });

        // Save to localStorage
        localStorage.setItem('bitchat-nickname', nickname);
      },

      addMessage: (message: BitchatMessage) => {
        const state = get();
        set({ messages: [...state.messages, message] });
      }, sendMessage: async (content: string, mentions: string[] = [], channel?: string) => {
        try {
          console.log('📤 Store: sendMessage called with:', { content, mentions, channel });
          console.log('📤 Store: Bluetooth service state:', get().isConnected);

          // Handle special commands
          if (content.startsWith('/')) {
            const command = content.toLowerCase().trim();

            if (command === '/w' || command === '/who' || command === '/online') {

              const state = get();
              const peers = bluetoothService.getConnectedPeers();
              const nicknames = bluetoothService.getPeerNicknames();

              let systemMessage: BitchatMessage;

              if (peers.length === 0) {
                systemMessage = {
                  id: `system-${Date.now()}`,
                  sender: 'system',
                  content: 'no one else is online right now.',
                  timestamp: new Date(),
                  isRelay: false,
                  isPrivate: false,
                  senderPeerID: 'system',
                  isEncrypted: false,
                  deliveryStatus: DeliveryStatus.DELIVERED
                };
              } else {
                const onlineList = peers
                  .filter(peerID => peerID !== bluetoothService.getMyPeerID())
                  .map(peerID => nicknames.get(peerID) || peerID)
                  .sort()
                  .join(', ');

                systemMessage = {
                  id: `system-${Date.now()}`,
                  sender: 'system',
                  content: `online users: ${onlineList}`,
                  timestamp: new Date(),
                  isRelay: false,
                  isPrivate: false,
                  senderPeerID: 'system',
                  isEncrypted: false,
                  deliveryStatus: DeliveryStatus.DELIVERED
                };
              }


              if (channel) {
                const channelMessages = state.channelMessages[channel] || [];
                set({
                  channelMessages: {
                    ...state.channelMessages,
                    [channel]: [...channelMessages, systemMessage]
                  }
                });
              } else {
                set({ messages: [...state.messages, systemMessage] });
              }

              return; // Don't send this as a network message
            }


          }

          if (channel) {

            console.log('📤 Store: Sending channel message');
            await bluetoothService.sendMessage(content, mentions, channel);
          } else {
            // Public message
            console.log('📤 Store: Sending public message');
            await bluetoothService.sendMessage(content, mentions);
          }
          console.log('📤 Store: Message sent successfully');

          // Add the sent message to local UI
          const state = get();
          const sentMessage: BitchatMessage = {
            id: `sent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sender: state.nickname,
            content,
            timestamp: new Date(),
            isRelay: false,
            isPrivate: false,
            senderPeerID: bluetoothService.getMyPeerID(),
            mentions: mentions.length > 0 ? mentions : undefined,
            channel,
            isEncrypted: false,
            deliveryStatus: DeliveryStatus.DELIVERED
          };

          console.log('📤 Store: Adding sent message to local UI:', sentMessage);

          if (channel) {

            const channelMessages = state.channelMessages[channel] || [];
            set({
              channelMessages: {
                ...state.channelMessages,
                [channel]: [...channelMessages, sentMessage]
              }
            });
          } else {

            set({ messages: [...state.messages, sentMessage] });
          }

        } catch (error) {
          console.error('📤 Store: Failed to send message:', error);
          set({ errorMessage: 'Failed to send message' });
        }
      },

      sendPrivateMessage: async (content: string, recipientPeerID: string, recipientNickname: string) => {
        try {
          await bluetoothService.sendPrivateMessage(content, recipientPeerID, recipientNickname);

          // Add the sent private message to local UI
          const state = get();
          const sentMessage: BitchatMessage = {
            id: `sent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sender: state.nickname,
            content,
            timestamp: new Date(),
            isRelay: false,
            isPrivate: true,
            recipientNickname,
            senderPeerID: bluetoothService.getMyPeerID(),
            isEncrypted: false,
            deliveryStatus: DeliveryStatus.DELIVERED
          };

          // Add to private chat
          const privateMessages = state.privateChats[recipientPeerID] || [];
          set({
            privateChats: {
              ...state.privateChats,
              [recipientPeerID]: [...privateMessages, sentMessage]
            }
          });

        } catch (error) {
          console.error('Failed to send private message:', error);
          set({ errorMessage: 'Failed to send private message' });
        }
      },

      joinChannel: (channel: string) => {
        const state = get();
        const newChannels = new Set(state.joinedChannels);
        newChannels.add(channel);
        set({
          joinedChannels: newChannels,
          currentChannel: channel
        });
      },

      leaveChannel: (channel: string) => {
        const state = get();
        const newChannels = new Set(state.joinedChannels);
        newChannels.delete(channel);

        // Remove channel messages
        const newChannelMessages = { ...state.channelMessages };
        delete newChannelMessages[channel];

        // Remove unread count
        const newUnreadChannelMessages = { ...state.unreadChannelMessages };
        delete newUnreadChannelMessages[channel];

        set({
          joinedChannels: newChannels,
          channelMessages: newChannelMessages,
          unreadChannelMessages: newUnreadChannelMessages,
          currentChannel: newChannels.has('#general') ? '#general' : newChannels.values().next().value || null
        });
      },

      setCurrentChannel: (channel: string | null) => {
        const state = get();

        // Clear unread count for this channel
        if (channel && state.unreadChannelMessages[channel]) {
          const newUnreadChannelMessages = { ...state.unreadChannelMessages };
          delete newUnreadChannelMessages[channel];
          set({
            currentChannel: channel,
            unreadChannelMessages: newUnreadChannelMessages
          });
        } else {
          set({ currentChannel: channel });
        }
      },

      setSelectedPrivateChat: (peerID: string | null) => {
        const state = get();

        // Clear unread count for this peer
        if (peerID && state.unreadPrivateMessages.has(peerID)) {
          const newUnreadPrivateMessages = new Set(state.unreadPrivateMessages);
          newUnreadPrivateMessages.delete(peerID);
          set({
            selectedPrivateChatPeer: peerID,
            unreadPrivateMessages: newUnreadPrivateMessages
          });
        } else {
          set({ selectedPrivateChatPeer: peerID });
        }
      },

      clearMessages: () => {
        set({
          messages: [],
          privateChats: {},
          channelMessages: {},
          unreadPrivateMessages: new Set(),
          unreadChannelMessages: {}
        });
      },

      connectToBluetooth: async () => {
        try {
          set({ errorMessage: null });

          if (!bluetoothService.isBluetoothSupported()) {
            throw new Error('Web Bluetooth is not supported in this browser');
          }

          await bluetoothService.requestDeviceConnection();

        } catch (error) {
          console.error('Failed to connect to Bluetooth:', error);
          set({ errorMessage: error instanceof Error ? error.message : 'Failed to connect to Bluetooth' });
        }
      },

      disconnectBluetooth: async () => {
        try {
          await bluetoothService.stopService();
          set({
            isConnected: false,
            connectedPeers: [],
            peerNicknames: new Map()
          });
        } catch (error) {
          console.error('Failed to disconnect Bluetooth:', error);
        }
      },

      updateConnectedPeers: (peers: string[]) => {
        set({
          connectedPeers: peers,
          isConnected: peers.length > 0
        });
      },

      updatePeerNicknames: (nicknames: Map<string, string>) => {
        set({ peerNicknames: nicknames });
      },

      togglePeerList: () => {
        const state = get();
        set({ showPeerList: !state.showPeerList });
      },

      toggleSettings: () => {
        const state = get();
        set({ showSettings: !state.showSettings });
      },

      setError: (error: string | null) => {
        set({ errorMessage: error });
      },

      markMessagesAsRead: (peerID?: string, channel?: string) => {
        const state = get();

        if (peerID) {
          // Mark private messages as read
          const newUnreadPrivateMessages = new Set(state.unreadPrivateMessages);
          newUnreadPrivateMessages.delete(peerID);
          set({ unreadPrivateMessages: newUnreadPrivateMessages });
        }

        if (channel) {
          // Mark channel messages as read
          const newUnreadChannelMessages = { ...state.unreadChannelMessages };
          delete newUnreadChannelMessages[channel];
          set({ unreadChannelMessages: newUnreadChannelMessages });
        }
      }
    };
  })
);

// Initialize nickname from localStorage
const savedNickname = localStorage.getItem('bitchat-nickname');
if (savedNickname) {
  useChatStore.getState().setNickname(savedNickname);
}
