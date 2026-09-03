type ProjectPlaceholderProps = {
  pageName: string;
};

export function ProjectPlaceholder({ pageName }: ProjectPlaceholderProps) {
  return (
    <main>
      <h1>{pageName}</h1>
      <p>Awaiting the approved Canva screenshot before implementation.</p>
    </main>
  );
}
