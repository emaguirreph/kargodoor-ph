import { redirect } from "next/navigation";

// Short link to share: opens the home page with the chat assistant already open.
export default function ChatLink() {
  redirect("/?chat=1");
}
