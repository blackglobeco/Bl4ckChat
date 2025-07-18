import React from "react";
import { useChatStore } from "../store/chatStore";

export const PeerList: React.FC = () => {
  const {
    connectedPeers,
    peerNicknames,
    selectedPrivateChatPeer,
    setSelectedPrivateChat,
    privateChats,
    unreadPrivateMessages,
    togglePeerList,
  } = useChatStore();

  const handlePeerClick = (peerID: string) => {
    setSelectedPrivateChat(peerID);
    togglePeerList(); // Close peer list on mobile after selection
  };

  const getPeerDisplayName = (peerID: string) => {
    return peerNicknames.get(peerID) || peerID.slice(0, 8);
  };

  const getMessageCount = (peerID: string) => {
    return privateChats[peerID]?.length || 0;
  };

  const hasUnreadMessages = (peerID: string) => {
    return unreadPrivateMessages.has(peerID);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-terminal-green p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Connected Peers</h3>
          <button
            onClick={togglePeerList}
            className="text-terminal-green hover:text-white text-xl"
          >
            ×
          </button>
        </div>
        <p className="text-sm opacity-75 mt-1">
          {connectedPeers.length} peer{connectedPeers.length !== 1 ? "s" : ""}{" "}
          online
        </p>
      </div>

      {/* Peer List */}
      <div className="flex-1 overflow-y-auto">
        {connectedPeers.length === 0 ? (
          <div className="p-4 text-center">
            <div className="text-gray-400 mb-4">
              <div className="text-4xl mb-2">📡</div>
              <p>No peers connected</p>
            </div>
            <div className="text-xs opacity-50">
              <p>Click "Connect" to scan for nearby BitChat devices</p>
              <p className="mt-1">
                Make sure Bluetooth is enabled on both devices
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {connectedPeers.map((peerID) => (
              <div
                key={peerID}
                onClick={() => handlePeerClick(peerID)}
                className={`p-3 rounded cursor-pointer transition-colors border ${
                  selectedPrivateChatPeer === peerID
                    ? "bg-terminal-green text-black border-terminal-green"
                    : "bg-terminal-gray hover:bg-opacity-80 border-transparent hover:border-terminal-green"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* Status Indicator */}
                    <div className="w-2 h-2 bg-terminal-green rounded-full"></div>

                    {/* Peer Info */}
                    <div>
                      <div className="font-semibold text-sm">
                        {getPeerDisplayName(peerID)}
                      </div>
                      <div className="text-xs opacity-75">
                        ID: {peerID.slice(0, 12)}...
                      </div>
                    </div>
                  </div>

                  {/* Message Info */}
                  <div className="text-right">
                    {hasUnreadMessages(peerID) && (
                      <div className="w-2 h-2 bg-red-500 rounded-full mb-1"></div>
                    )}
                    {getMessageCount(peerID) > 0 && (
                      <div className="text-xs opacity-75">
                        {getMessageCount(peerID)} msg
                        {getMessageCount(peerID) !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-terminal-green p-3">
        <div className="text-xs space-y-1 opacity-75">
          <div className="flex items-center justify-between">
            <span>Mesh Status:</span>
            <span
              className={
                connectedPeers.length > 0
                  ? "text-terminal-green"
                  : "text-red-400"
              }
            >
              {connectedPeers.length > 0 ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Protocol:</span>
            <span>Bluetooth LE</span>
          </div>
          {selectedPrivateChatPeer && (
            <div className="pt-2 border-t border-terminal-green border-opacity-30 mt-2">
              <span className="text-terminal-green">
                💬 Private chat with{" "}
                {getPeerDisplayName(selectedPrivateChatPeer)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
