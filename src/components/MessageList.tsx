import React, { useEffect, useRef } from "react";
import { BitchatMessage } from "../models/BitchatMessage";
import { useChatStore } from "../store/chatStore";

interface MessageListProps {
  messages: BitchatMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const { nickname } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (timestamp: Date) => {
    try {
      // Ensure we have a valid Date object
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return "??:??";
      }
      
      // IRC-style timestamp: HH:MM format, 24-hour
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error, timestamp);
      return "??:??";
    }
  };

  const isMyMessage = (message: BitchatMessage) => {
    return message.sender === nickname;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 font-mono">
      {messages.length === 0 ? (
        <div className="text-gray-500 text-center mt-8">
          <p>*** No messages yet ***</p>
          <p className="text-sm mt-2 opacity-75">
            *** Connect to nearby devices or send a message to begin ***
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {messages.map((message) => (
            <div key={message.id} className="flex items-start space-x-3">
              {/* Timestamp */}
              <span className="text-xs text-gray-500 min-w-[55px] flex-shrink-0 mt-0.5 font-mono">
                {formatTime(message.timestamp)}
              </span>

              {/* Message Content */}
              <div className="flex-1">
                {/* Channel/Private prefix */}
                {message.channel && (
                  <span className="text-yellow-400">#{message.channel} </span>
                )}
                {message.isPrivate && (
                  <span className="text-purple-400">
                    [Private
                    {message.recipientNickname
                      ? ` to ${message.recipientNickname}`
                      : ""}
                    ]
                  </span>
                )}

                {/* Sender and content */}
                <span
                  className={
                    isMyMessage(message)
                      ? "text-terminal-green"
                      : "text-blue-400"
                  }
                >
                  &lt;{message.sender}&gt;
                </span>
                <span className="text-terminal-green ml-1">
                  {message.content}
                </span>

                {/* Delivery status for own messages */}
                {message.deliveryStatus && isMyMessage(message) && (
                  <span className="text-xs text-gray-500 ml-2">
                    {message.deliveryStatus === "delivered" && "✓"}
                    {message.deliveryStatus === "read" && "✓✓"}
                    {message.deliveryStatus === "pending" && "⏱"}
                    {message.deliveryStatus === "failed" && "❌"}
                  </span>
                )}

                {/* Mentions */}
                {message.mentions && message.mentions.length > 0 && (
                  <div className="text-xs text-yellow-400 ml-12">
                    *** mentions: {message.mentions.join(", ")} ***
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
