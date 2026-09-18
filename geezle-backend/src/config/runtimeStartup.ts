export type RuntimeStartupPlan = {
  startHttpServer: true;
  startBackgroundWorkers: boolean;
};

export const getRuntimeStartupPlan = ({
  backgroundWorkersEnabled,
  prismaReady
}: {
  backgroundWorkersEnabled: boolean;
  prismaReady: boolean;
}): RuntimeStartupPlan => ({
  startHttpServer: true,
  startBackgroundWorkers: backgroundWorkersEnabled && prismaReady
});
