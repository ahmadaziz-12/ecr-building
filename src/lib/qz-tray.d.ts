declare module "qz-tray" {
  interface QZConfig {
    [key: string]: unknown;
  }

  interface PrintData {
    type: "raw" | "pixel" | "html";
    format: "command" | "base64" | "file" | "plain";
    data: number[] | string | Uint8Array;
    options?: Record<string, unknown>;
  }

  interface SerialStreamEvent {
    portName: string;
    output?: string;
    exception?: string;
    type?: string;
  }

  interface SerialPortOptions {
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: "NONE" | "EVEN" | "ODD" | "MARK" | "SPACE" | "AUTO";
    flowControl?: string;
    encoding?: string;
    rx?: { untilNewline?: boolean; start?: string | string[]; end?: string; width?: number };
  }

  interface QZ {
    websocket: {
      connect(options?: { retries?: number; delay?: number; host?: string; port?: { secure: number[]; insecure: number[] } }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
      getDefault(): Promise<string>;
    };
    // Serial Port API (RS232/COM/TTY) — used for the Weighing Scale integration (src/lib/scaleBridge.ts)
    // to read live weight straight from a scale's serial port through the same already-installed QZ
    // Tray bridge used for printing, instead of a separate companion service.
    serial: {
      findPorts(): Promise<string[]>;
      setSerialCallbacks(calls: (streamEvent: SerialStreamEvent) => void): void;
      openPort(port: string, options?: SerialPortOptions): Promise<null>;
      sendData(port: string, data: string, options?: SerialPortOptions): Promise<null>;
      closePort(port: string): Promise<null>;
    };
    configs: {
      create(printer: string, options?: Record<string, unknown>): QZConfig;
    };
    print(config: QZConfig, data: PrintData[]): Promise<void>;
    security: {
      setCertificatePromise(cb: (resolve: (cert: string | null) => void, reject: (err: unknown) => void) => void): void;
      setSignaturePromise(cb: (toSign: string) => (resolve: (sig: string | null) => void, reject: (err: unknown) => void) => void): void;
      setSignatureAlgorithm(algorithm: "SHA1" | "SHA256" | "SHA512"): void;
    };
  }

  const qz: QZ;
  export default qz;
}
