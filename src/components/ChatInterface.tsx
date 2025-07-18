import React, { useState, useMemo } from "react";
import { useChatStore } from "../store/chatStore";

import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { PeerList } from "./PeerList";
import { ChannelTabs } from "./ChannelTabs";
import { ConnectButton } from "./ConnectButton";

export const ChatInterface: React.FC = () => {
  const {
    messages,
    currentChannel,
    channelMessages,
    selectedPrivateChatPeer,
    privateChats,
    isConnected,
    connectedPeers,
    showPeerList,
    togglePeerList,
    nickname,
    setNickname,
  } = useChatStore();

  const [showNicknameInput, setShowNicknameInput] = useState(false);
  const [tempNickname, setTempNickname] = useState(nickname);

  const currentMessages = useMemo(() => {
    if (selectedPrivateChatPeer) {
      const privMsgs = privateChats[selectedPrivateChatPeer] || [];
      console.log("🎯 Returning private messages:", privMsgs.length);
      return privMsgs;
    }
    if (currentChannel) {
      const chanMsgs = channelMessages[currentChannel] || [];
      console.log("🎯 Returning channel messages:", chanMsgs.length);
      return chanMsgs;
    }

    const publicMessages = messages.filter((m) => {
      const isPublic = !m.channel && !m.isPrivate;
      console.log(
        "🎯 Message:",
        m.id,
        "isPublic:",
        isPublic,
        "channel:",
        m.channel,
        "isPrivate:",
        m.isPrivate
      );
      return isPublic;
    });
    console.log("🎯 Returning public messages:", publicMessages.length);
    return publicMessages;
  }, [
    messages,
    selectedPrivateChatPeer,
    currentChannel,
    privateChats,
    channelMessages,
  ]);

  const handleNicknameSubmit = () => {
    if (tempNickname.trim()) {
      setNickname(tempNickname.trim());
      setShowNicknameInput(false);
    }
  };

  return (
    <div className="h-full flex">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Connection Status & Controls */}
        <div className="border-b border-terminal-green p-2 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected ? "bg-terminal-green" : "bg-red-500"
                }`}
              />
              <span className="text-sm">
                {isConnected
                  ? `Connected (${connectedPeers.length} peer${
                      connectedPeers.length !== 1 ? "s" : ""
                    })`
                  : "Disconnected"}
              </span>
            </div>

            {/* Nickname Display/Edit */}
            <div className="flex items-center space-x-2">
              <span className="text-sm">Nick:</span>
              {showNicknameInput ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={tempNickname}
                    onChange={(e) => setTempNickname(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && handleNicknameSubmit()
                    }
                    onBlur={handleNicknameSubmit}
                    className="terminal-input bg-terminal-gray px-2 py-1 text-sm rounded w-32"
                    autoFocus
                  />
                </div>
              ) : (
                <span
                  className="text-sm cursor-pointer hover:underline"
                  onClick={() => {
                    setTempNickname(nickname);
                    setShowNicknameInput(true);
                  }}
                >
                  {nickname}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Connect Button */}
            <ConnectButton />

            {/* Peer List Toggle */}
            <button
              onClick={togglePeerList}
              className="terminal-button text-sm"
            >
              Peers {connectedPeers.length > 0 && `(${connectedPeers.length})`}
            </button>
          </div>
        </div>

        {/* Channel Tabs */}
        <ChannelTabs />

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <MessageList messages={currentMessages} />
        </div>

        {/* Message Input */}
        <div className="border-t border-terminal-green">
          <MessageInput />
        </div>
      </div>

      {/* Peer List Sidebar */}
      {showPeerList && (
        <div className="w-80 border-l border-terminal-green">
          <PeerList />
        </div>
      )}
    </div>
  );
};
