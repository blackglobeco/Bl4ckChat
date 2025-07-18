import React from "react";
import { useChatStore } from "../store/chatStore";

export const ConnectButton: React.FC = () => {
  const { isConnected, connectToBluetooth, disconnectBluetooth } =
    useChatStore();

  const handleConnect = async () => {
    try {
      await connectToBluetooth();
    } catch (error) {
      console.error("Connection failed:", error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectBluetooth();
    } catch (error) {
      console.error("Disconnection failed:", error);
    }
  };

  if (!navigator.bluetooth) {
    return (
      <div className="text-red-400 text-sm">Web Bluetooth not supported</div>
    );
  }

  return (
    <button
      onClick={isConnected ? handleDisconnect : handleConnect}
      className={`terminal-button text-sm ${
        isConnected
          ? "bg-red-700 hover:bg-red-600"
          : "bg-green-700 hover:bg-green-600"
      }`}
    >
      {isConnected ? "Disconnect" : "Connect"}
    </button>
  );
};
