import { Bot, User, Terminal } from "lucide-react";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import { useEffect, useState } from "react";
import type { FC } from "react";
import hljs from "highlight.js";
import type { Message } from "@/types/conversation";

interface Props {
  message: Message;
  isInitialSystem?: boolean;
}

marked.setOptions({
  gfm: true,
  breaks: true,
  silent: true,
});

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang, info) {
      // check if info has ext, if so, use that as lang
      lang = info.split(".")[1] || lang;
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

export const ChatMessage: FC<Props> = ({ message }) => {
  const [parsedContent, setParsedContent] = useState("");

  // Ensure content is never undefined
  const content =
    message.content || (message.role == "assistant" ? "Thinking..." : "");

  useEffect(() => {
    let isMounted = true;
    const processContent = async () => {
      try {
        // Transform thinking tags before markdown parsing
        const processedContent = content.replace(
          /(?:[^`])<thinking>([\s\S]*?)(?:<\/thinking>|$)/g,
          (_match: string, thinkingContent: string) =>
            `<details><summary>Thinking</summary>\n\n${thinkingContent}\n\n</details>`
        );

        // Parse markdown to HTML
        let parsedResult = await marked.parse(processedContent, {
          async: true,
        });

        // Wrap code blocks in details/summary
        parsedResult = parsedResult.replace(
          /<pre><code(?:\s+class="([^"]+)")?>([^]*?)<\/code><\/pre>/g,
          (_, classes = "", code) => {
            const langtag = ((classes || "").split(" ")[1] || "Code").replace(
              "language-",
              ""
            );
            return `
            <details>
              <summary>${langtag}</summary>
              <pre><code class="${classes}">${code}</code></pre>
            </details>
          `;
          }
        );

        if (isMounted) {
          setParsedContent(parsedResult);
        }
      } catch (error) {
        console.error("Error parsing markdown:", error);
        if (isMounted) {
          setParsedContent(content);
        }
      }
    };

    processContent();

    return () => {
      isMounted = false;
    };
  }, [content]);

  return (
    <div className="py-4">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-start space-x-4">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              message.role === "assistant"
                ? "bg-gptme-600 text-white"
                : message.role === "system"
                ? "bg-slate-500 text-white"
                : "bg-blue-600 text-white"
            }`}
          >
            {message.role === "assistant" ? (
              <Bot className="w-4 h-4" />
            ) : message.role === "system" ? (
              <Terminal className="w-4 h-4" />
            ) : (
              <User className="w-4 h-4" />
            )}
          </div>
          <div
            className={`flex-1 chat-message prose prose-sm dark:prose-invert prose-pre:overflow-x-auto prose-pre:max-w-[calc(100vw-16rem)] ${
              message.role === "system" ? "text-muted-foreground" : ""
            }`}
            dangerouslySetInnerHTML={{ __html: parsedContent }}
          />
        </div>
      </div>
    </div>
  );
};