import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ModulePage } from "@/components/buildpos/ModulePage";
import { KioskPairingSheet } from "@/components/network/KioskPairingSheet";
import { SessionLogsPanel } from "@/components/network/SessionLogsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function TerminalsPage() {
  const [pairingTerminalId, setPairingTerminalId] = useState<number | null>(null);

  return (
    <>
      <Tabs defaultValue="terminals">
        <TabsList>
          <TabsTrigger value="terminals">Terminals</TabsTrigger>
          <TabsTrigger value="sessions">Session Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="terminals">
          <ModulePage onOpenKioskPairing={setPairingTerminalId} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionLogsPanel />
        </TabsContent>
      </Tabs>
      <KioskPairingSheet terminalId={pairingTerminalId} onOpenChange={(open) => !open && setPairingTerminalId(null)} />
    </>
  );
}

export const Route = createFileRoute("/network/terminals")({
  head: () => ({ meta: [{ title: "Terminals — BuildPOS" }, { name: "description", content: "Terminals module of the BuildPOS building materials retail platform." }] }),
  component: TerminalsPage,
});
