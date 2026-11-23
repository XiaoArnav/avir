/**
 * Centralized Request Coordinator
 * Eliminates cross-city race conditions, stale response contamination,
 * in-flight request storms, and desynchronized AI plan state.
 */

export interface RequestContext {
  generation: number;
  cityKey: string;
  signal: AbortSignal;
  startedAt: number;
}

export interface PlanGenerationContext {
  generation: number;
  cityKey: string;
  fingerprint: string;
  startedAt: number;
}

export class RequestCoordinator {
  private currentTelemetryGeneration = 0;
  private currentPlanGeneration = 0;
  private activeTelemetryController: AbortController | null = null;
  private activeCityKey = '';
  private activePlanFingerprint = '';

  // In-flight promise map for deduplication
  private inFlightTelemetry = new Map<string, Promise<any>>();

  /**
   * Generates a stable key for a city based on coordinates and name.
   */
  static getCityKey(latitude: number, longitude: number, cityName?: string): string {
    const namePart = (cityName || 'city').toLowerCase().trim();
    return `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${namePart}`;
  }

  /**
   * Generates an immutable fingerprint of AI plan inputs.
   */
  static getPlanFingerprint(params: {
    cityName: string;
    metricsTimestamp?: string | null;
    usAqi?: number | null;
    pm25?: number | null;
    profileId?: string;
    roomSizeSqFt?: number;
    customRoutine?: string;
  }): string {
    const parts = [
      params.cityName.toLowerCase().trim(),
      params.metricsTimestamp || 'notime',
      params.usAqi ?? 'null',
      params.pm25 ?? 'null',
      params.profileId || 'general',
      params.roomSizeSqFt || 150,
      params.customRoutine ? params.customRoutine.trim().slice(0, 32) : 'none',
    ];
    return parts.join('|');
  }

  /**
   * Begins a new coordinated telemetry request.
   * Cancels any previously active in-flight telemetry fetch and increments generation.
   */
  beginTelemetryRequest(
    latitude: number,
    longitude: number,
    cityName?: string
  ): RequestContext {
    // 1. Abort any previous in-flight request
    if (this.activeTelemetryController) {
      try {
        this.activeTelemetryController.abort();
      } catch {
        // Ignore already aborted controllers
      }
    }

    // 2. Increment generation counter and create fresh controller
    this.currentTelemetryGeneration += 1;
    const generation = this.currentTelemetryGeneration;
    const cityKey = RequestCoordinator.getCityKey(latitude, longitude, cityName);
    this.activeCityKey = cityKey;

    this.activeTelemetryController = new AbortController();

    return {
      generation,
      cityKey,
      signal: this.activeTelemetryController.signal,
      startedAt: Date.now(),
    };
  }

  /**
   * Evaluates whether a telemetry response is still valid to commit into UI state.
   * Rejects responses from obsolete generations or superseded cities.
   */
  isTelemetryResponseValid(context: RequestContext): boolean {
    if (context.generation !== this.currentTelemetryGeneration) {
      return false;
    }
    if (context.cityKey !== this.activeCityKey) {
      return false;
    }
    if (context.signal.aborted) {
      return false;
    }
    return true;
  }

  /**
   * Deduplicates concurrent in-flight telemetry fetch executions for identical keys.
   */
  async coalesceTelemetryFetch<T>(
    key: string,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const existing = this.inFlightTelemetry.get(key);
    if (existing) {
      return existing;
    }

    const promise = fetchFn()
      .finally(() => {
        this.inFlightTelemetry.delete(key);
      });

    this.inFlightTelemetry.set(key, promise);
    return promise;
  }

  /**
   * Begins a coordinated AI plan generation request.
   */
  beginPlanRequest(params: {
    cityName: string;
    metricsTimestamp?: string | null;
    usAqi?: number | null;
    pm25?: number | null;
    profileId?: string;
    roomSizeSqFt?: number;
    customRoutine?: string;
  }): PlanGenerationContext {
    this.currentPlanGeneration += 1;
    const generation = this.currentPlanGeneration;
    const cityKey = params.cityName.toLowerCase().trim();
    const fingerprint = RequestCoordinator.getPlanFingerprint(params);
    this.activePlanFingerprint = fingerprint;

    return {
      generation,
      cityKey,
      fingerprint,
      startedAt: Date.now(),
    };
  }

  /**
   * Evaluates whether a generated AI plan is still valid to commit.
   * Rejects plans whose inputs have changed, city has switched, or generation is superseded.
   */
  isPlanResponseValid(context: PlanGenerationContext): boolean {
    if (context.generation !== this.currentPlanGeneration) {
      return false;
    }
    if (context.fingerprint !== this.activePlanFingerprint) {
      return false;
    }
    return true;
  }

  /**
   * Invalidate and abort all active requests (e.g. on unmount).
   */
  abortAll(): void {
    if (this.activeTelemetryController) {
      try {
        this.activeTelemetryController.abort();
      } catch {
        // Ignore
      }
      this.activeTelemetryController = null;
    }
    this.currentTelemetryGeneration += 1;
    this.currentPlanGeneration += 1;
    this.inFlightTelemetry.clear();
  }

  get telemetryGeneration(): number {
    return this.currentTelemetryGeneration;
  }

  get planGeneration(): number {
    return this.currentPlanGeneration;
  }
}
