import { ChatInterface } from "./components/ChatInterface";
import { useChatStore } from "./store/chatStore";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

function App() {
  const { errorMessage, setError } = useChatStore();

  return (
    <div className="min-h-screen bg-black text-terminal-green font-mono">
      <ErrorBoundary>
        <div className="container mx-auto max-w-6xl h-screen flex flex-col">
          {/* Header */}
          <header className="border-b border-terminal-green p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold">BlackChat</h1>
              </div>

              {/* Bluetooth Support Warning */}
              {!navigator.bluetooth && (
                <div className="text-red-400 text-sm">
                  ⚠️ Web Bluetooth not supported
                </div>
              )}
            </div>
          </header>

          {/* Error Display */}
          {errorMessage && (
            <div className="bg-red-900 border border-red-500 text-red-100 px-4 py-2 flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-300 hover:text-red-100 ml-4"
              >
                ✕
              </button>
            </div>
          )}

          {/* Main Chat Interface */}
          <div className="flex-1 overflow-hidden">
            <ChatInterface />
          </div>

          {/* Footer */}
          <footer className="border-t border-terminal-green p-2 text-xs opacity-50">
            <div className="flex justify-between">
              <span>BlackChat - Black Globe ® • Public Domain</span>
              <span>
                {navigator.bluetooth
                  ? "Bluetooth Ready"
                  : "Bluetooth Unavailable"}
              </span>
            </div>
          </footer>
        </div>
      </ErrorBoundary>
    </div>
  );
}

export default App;
