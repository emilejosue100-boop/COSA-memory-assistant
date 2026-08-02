import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AssistantAnswerTextProps {
  content: string;
  className?: string;
}

export default function AssistantAnswerText({
  content,
  className = 'text-sm',
}: AssistantAnswerTextProps) {
  return (
    <div className={`prose-answer text-oil-black leading-relaxed ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
