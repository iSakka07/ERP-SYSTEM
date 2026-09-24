import Home from "../page";
export default function AttentionPage() { return <Home searchParams={Promise.resolve({ attention: "all" })} />; }
