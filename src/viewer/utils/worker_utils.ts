
function run_thread(worker_path: string, onExecute: (worker: Worker) => void, onError: (error: any) => void, onFinish: (data: any) => void) {
  fetch(worker_path)
  .then(result => result.blob())
  .then(blob => {
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);
	
	// Set function to execute after creating the worker
	onExecute(worker);

	// Set function with the results of the computation
	worker.onmessage = function(e) {
		const data = e.data;
		if ('error' in data) {
			// Handle error
			onError(data.error);
			return;
		}
		onFinish(data);
	};
  });
}

export { run_thread };
