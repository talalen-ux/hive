import type { NextApiRequest, NextApiResponse } from "next";
import { loadProject } from "@/lib/projects";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { key } = req.query;
  if (typeof key !== "string" || key.length === 0 || key.length > 64 || !/^[a-z0-9-]+$/.test(key)) {
    res.status(400).json({ error: "bad key" });
    return;
  }
  const project = loadProject(key);
  if (!project) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  res.status(200).json({ project });
}
