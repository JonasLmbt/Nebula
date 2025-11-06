declare module 'tail' {
	export class Tail {
		constructor(filename: string, options?: any);
		on(event: 'line' | 'error' | string, cb: (...args: any[]) => void): this;
		unwatch(): void;
	}
}
