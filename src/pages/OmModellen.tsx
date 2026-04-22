import ReactMarkdown from "react-markdown";
import content from "@/content/om-modellen.md?raw";

export default function OmModellen() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <article
        className="prose prose-slate max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-3xl prose-h1:mb-2
          prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 prose-h2:border-b prose-h2:pb-2
          prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
          prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground/85
          prose-li:text-sm prose-li:text-foreground/85
          prose-strong:text-foreground prose-strong:font-semibold
          prose-hr:my-8 prose-hr:border-border"
      >
        <ReactMarkdown>{content}</ReactMarkdown>
      </article>
    </div>
  );
}
