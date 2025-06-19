import { ExrPreview } from './exrPreview';

export class VerivSingleton {
	private static instance: VerivSingleton;

	_previews : ExrPreview | null = null;
	_activePreview: ExrPreview | undefined;

    private constructor() { }

    public static getInstance(): VerivSingleton {
        if (!VerivSingleton.instance) {
            VerivSingleton.instance = new VerivSingleton();
        }
		return VerivSingleton.instance;
	}
}
