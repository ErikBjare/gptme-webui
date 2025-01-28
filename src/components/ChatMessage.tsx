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
      lang = info.split(".")[1] || lang;
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

export const ChatMessage: FC<Props> = ({ message }) => {
  const [parsedContent, setParsedContent] = useState("");

  const content = message.content || (message.role == "assistant" ? "Thinking..." : "");

  useEffect(() => {
    let isMounted = true;
    const processContent = async () => {
      try {
        const processedContent = content.replace(
          /(?:[^`])<thinking>([\s\S]*?)(?:<\/thinking>|$)/g,
          (_match: string, thinkingContent: string) =>
            `<details><summary>Thinking</summary>\n\n${thinkingContent}\n\n</details>`
        );

        let parsedResult = await marked.parse(processedContent, {
          async: true,
        });

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

  const avatarClasses = `hidden md:flex mt-0.5 flex-shrink-0 w-8 h-8 rounded-full items-center justify-center absolute ${
    message.role === "assistant"
      ? "bg-gptme-600 text-white left-0"
      : message.role === "system"
      ? "bg-slate-500 text-white left-0"
      : "bg-blue-600 text-white right-0"
  }`;

  return (
    <div className="py-4">
      <div className="max-w-3xl mx-auto px-4">
        <div className="relative">
          <div className={avatarClasses}>
            {message.role === "assistant" ? (
              <Bot className="w-5 h-5" />
            ) : message.role === "system" ? (
              <Terminal className="w-5 h-5" />
            ) : (
              <User className="w-5 h-5" />
            )}
          </div>
            <div className="md:px-12">
            <div className={`rounded-lg px-3 py-1.5 ${
              message.role === "assistant"
                ? "bg-card"
                : message.role === "user"
                ? "dark:bg-[#2A3441] bg-[#EAF4FF] dark:text-white"
                : "bg-muted"
            }`}>
              <div
                className="chat-message prose prose-sm dark:prose-invert prose-pre:overflow-x-auto prose-pre:max-w-[calc(100vw-16rem)]"
                dangerouslySetInnerHTML={{ __html: parsedContent }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
