import React, { useState } from "react";
import { useChatStore } from "../store/chatStore";

export const ChannelTabs: React.FC = () => {
  const {
    joinedChannels,
    currentChannel,
    setCurrentChannel,
    unreadChannelMessages,
    joinChannel,
    leaveChannel,
    setSelectedPrivateChat,
  } = useChatStore();

  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");

  const handleChannelSelect = (channel: string) => {
    setCurrentChannel(channel);
    setSelectedPrivateChat(null); // Clear private chat selection
  };

  const handleJoinChannel = () => {
    if (newChannelName.trim()) {
      let channelName = newChannelName.trim();
      if (!channelName.startsWith("#")) {
        channelName = "#" + channelName;
      }
      joinChannel(channelName);
      setNewChannelName("");
      setShowJoinDialog(false);
    }
  };

  const handleLeaveChannel = (channel: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (channel !== "#general") {
      // Don't allow leaving general
      leaveChannel(channel);
    }
  };

  const getUnreadCount = (channel: string) => {
    return unreadChannelMessages[channel] || 0;
  };

  return (
    <div className="border-b border-terminal-green">
      <div className="flex items-center p-2 space-x-1 overflow-x-auto">
        {/* Public Tab */}
        <button
          onClick={() => {
            setCurrentChannel(null);
            setSelectedPrivateChat(null);
          }}
          className={`channel-tab whitespace-nowrap ${
            !currentChannel ? "active" : ""
          }`}
        >
          Public
        </button>

        {/* Channel Tabs */}
        {Array.from(joinedChannels).map((channel) => (
          <div key={channel} className="relative group">
            <button
              onClick={() => handleChannelSelect(channel)}
              className={`channel-tab whitespace-nowrap pr-8 ${
                currentChannel === channel ? "active" : ""
              }`}
            >
              {channel}
              {getUnreadCount(channel) > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                  {getUnreadCount(channel)}
                </span>
              )}
            </button>

            {/* Close button */}
            {channel !== "#general" && (
              <button
                onClick={(e) => handleLeaveChannel(channel, e)}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {/* Join Channel Button */}
        <button
          onClick={() => setShowJoinDialog(true)}
          className="channel-tab text-terminal-green hover:bg-terminal-green hover:text-black whitespace-nowrap"
        >
          + Join
        </button>
      </div>

      {/* Join Channel Dialog */}
      {showJoinDialog && (
        <div className="p-4 bg-terminal-gray border-b border-terminal-green">
          <div className="flex items-center space-x-2">
            <span className="text-sm">Join channel:</span>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleJoinChannel()}
              placeholder="channel-name"
              className="terminal-input bg-black border border-terminal-green rounded px-2 py-1 text-sm flex-1"
              autoFocus
            />
            <button
              onClick={handleJoinChannel}
              disabled={!newChannelName.trim()}
              className="terminal-button text-sm px-3 py-1 disabled:opacity-50"
            >
              Join
            </button>
            <button
              onClick={() => {
                setShowJoinDialog(false);
                setNewChannelName("");
              }}
              className="text-sm text-red-400 hover:text-red-300 px-2"
            >
              Cancel
            </button>
          </div>
          <div className="text-xs opacity-75 mt-2">
            Enter channel name (# will be added automatically)
          </div>
        </div>
      )}

      {/* Current View Indicator */}
      <div className="px-4 py-1 text-xs bg-black border-b border-terminal-green border-opacity-30">
        <span className="opacity-75">
          {currentChannel ? (
            <>
              Viewing channel:{" "}
              <span className="text-terminal-green">{currentChannel}</span>
            </>
          ) : (
            <>
              Viewing: <span className="text-terminal-green">Public chat</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
};
