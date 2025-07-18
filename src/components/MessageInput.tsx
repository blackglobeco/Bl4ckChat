import React, { useState, useRef, useEffect } from "react";
import { useChatStore } from "../store/chatStore";

export const MessageInput: React.FC = () => {
  const {
    sendMessage,
    sendPrivateMessage,
    joinChannel,
    currentChannel,
    selectedPrivateChatPeer,
    connectedPeers,
    peerNicknames,
    clearMessages,
  } = useChatStore();

  const [message, setMessage] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = [
    { cmd: "/j #channel", desc: "Join or create a channel" },
    { cmd: "/m @name message", desc: "Send a private message" },
    { cmd: "/w", desc: "List online users" },
    { cmd: "/channels", desc: "Show all discovered channels" },
    { cmd: "/clear", desc: "Clear chat messages" },
    { cmd: "/help", desc: "Show this help" },
  ];

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentChannel, selectedPrivateChatPeer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("💬 MessageInput: Form submitted with message:", message);

    if (!message.trim()) {
      console.log("💬 MessageInput: Empty message, returning");
      return;
    }

    const trimmedMessage = message.trim();
    console.log("💬 MessageInput: Processing message:", trimmedMessage);

    // Handle commands
    if (trimmedMessage.startsWith("/")) {
      console.log("💬 MessageInput: Handling command");
      await handleCommand(trimmedMessage);
    } else {
      // Send regular message
      console.log("💬 MessageInput: Sending regular message");
      console.log(
        "💬 MessageInput: selectedPrivateChatPeer:",
        selectedPrivateChatPeer
      );
      console.log("💬 MessageInput: currentChannel:", currentChannel);

      if (selectedPrivateChatPeer) {
        // Private message
        console.log("💬 MessageInput: Sending private message");
        const recipientNickname =
          peerNicknames.get(selectedPrivateChatPeer) || selectedPrivateChatPeer;
        await sendPrivateMessage(
          trimmedMessage,
          selectedPrivateChatPeer,
          recipientNickname
        );
      } else {
        // Channel or public message
        console.log("💬 MessageInput: Sending public/channel message");
        await sendMessage(trimmedMessage, [], currentChannel || undefined);
      }
    }

    console.log("💬 MessageInput: Clearing message input");
    setMessage("");
    setShowCommands(false);
  };

  const handleCommand = async (command: string) => {
    const parts = command.split(" ");
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case "/j":
      case "/join":
        if (parts[1] && parts[1].startsWith("#")) {
          joinChannel(parts[1]);
        } else {
          console.log("Usage: /j #channelname");
        }
        break;

      case "/m":
      case "/msg":
        if (parts.length >= 3 && parts[1].startsWith("@")) {
          const targetNick = parts[1].substring(1);
          const messageContent = parts.slice(2).join(" ");

          // Find peer ID by nickname
          let targetPeerID: string | null = null;
          for (const [peerID, nickname] of peerNicknames) {
            if (nickname === targetNick) {
              targetPeerID = peerID;
              break;
            }
          }

          if (targetPeerID) {
            await sendPrivateMessage(messageContent, targetPeerID, targetNick);
          } else {
            console.log(`User @${targetNick} not found`);
          }
        } else {
          console.log("Usage: /m @nickname message");
        }
        break;

      case "/w":
      case "/who":
        // Show online users as a system message
        console.log("Debug /w command:");
        console.log("- connectedPeers:", connectedPeers);
        console.log("- peerNicknames:", Array.from(peerNicknames.entries()));

        // Get all connected peers except ourselves
        const { bluetoothService } = useChatStore.getState();
        const myPeerID = bluetoothService.getMyPeerID();

        const onlinePeerIDs = connectedPeers.filter(
          (peerID) => peerID !== myPeerID
        );
        const onlineUsers = onlinePeerIDs
          .map((peerID) => peerNicknames.get(peerID) || peerID)
          .sort();

        console.log("- myPeerID:", myPeerID);
        console.log("- onlinePeerIDs:", onlinePeerIDs);
        console.log("- onlineUsers:", onlineUsers);

        let systemMessage;

        if (onlineUsers.length === 0) {
          systemMessage = "no one else is online right now.";
        } else {
          systemMessage = `online users: ${onlineUsers.join(", ")}`;
        }

        console.log("- systemMessage:", systemMessage);

        // Send as a regular message but with system-like formatting
        if (selectedPrivateChatPeer) {
          // Show in private chat context
          await sendMessage(`[System] ${systemMessage}`, [], undefined);
        } else if (currentChannel) {
          // Show in channel context
          await sendMessage(`[System] ${systemMessage}`, [], currentChannel);
        } else {
          // Show in public context
          await sendMessage(`[System] ${systemMessage}`, [], undefined);
        }
        break;

      case "/clear":
        clearMessages();
        break;

      case "/help":
        setShowCommands(true);
        break;

      default:
        console.log(`Unknown command: ${cmd}`);
        setShowCommands(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      setShowCommands(!showCommands);
    }
  };

  const getCurrentPlaceholder = () => {
    if (selectedPrivateChatPeer) {
      const nickname =
        peerNicknames.get(selectedPrivateChatPeer) || selectedPrivateChatPeer;
      return `Message @${nickname}...`;
    }
    if (currentChannel) {
      return `Message ${currentChannel}...`;
    }
    return "Type a message... (Press Tab for commands)";
  };

  return (
    <div className="p-4">
      {/* Command Help */}
      {showCommands && (
        <div className="mb-4 p-3 bg-terminal-gray rounded border border-terminal-green">
          <h4 className="text-sm font-bold mb-2">Available Commands:</h4>
          <div className="space-y-1 text-xs">
            {commands.map((item, index) => (
              <div key={index} className="flex">
                <span className="font-mono text-terminal-green w-24">
                  {item.cmd}
                </span>
                <span className="opacity-75">{item.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs opacity-50">
            Press Tab to toggle this help
          </div>
        </div>
      )}

      {/* Message Form */}
      <form onSubmit={handleSubmit} className="flex space-x-2">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getCurrentPlaceholder()}
          className="flex-1 terminal-input bg-terminal-gray border border-terminal-green rounded px-3 py-2"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!message.trim()}
          className="terminal-button px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>

      {/* Status */}
      <div className="mt-2 text-xs opacity-50">
        {selectedPrivateChatPeer ? (
          <span>
            Private chat with{" "}
            {peerNicknames.get(selectedPrivateChatPeer) ||
              selectedPrivateChatPeer}
          </span>
        ) : currentChannel ? (
          <span>Channel: {currentChannel}</span>
        ) : (
          <span>Public chat</span>
        )}
        {connectedPeers.length === 0 && (
          <span className="text-red-400 ml-2">⚠ No peers connected</span>
        )}
      </div>
    </div>
  );
};
