# Technical Indicators

These technical indicators have been taken from the [technicalindicators](https://github.com/anandanand84/technicalindicators "technicalindicators") library.

The indicators have been imported here for a few reasons:
- Easier integration with the trading strategies
- Easier to debug functionality, review and fix any issues
- Original library seems to no longer be maintained
- Ability to pass code / function signatures to LLMs to automatically use functions when generating strategies
- Easier to review performance and implement improvements

# Usage

In strategy files technical indicators can be used like this:

```javascript
import { BollingerBands } from '../technical-indicators';

let result = BollingerBands.calculate({ values: [1, 2, 3, 4, 5, 6, 7, 8, 9], period: 20, stdDev: 2 });

// Or create an instance to incrementally calculate
let bb = new BollingerBands({ values: [1, 2, 3, 4], period: 20, stdDev: 2 });
let nextValue = bb.nextValue(5);
```

Most indicators use generators and calculate the values for all available input data every time, which may not be optimal in terms of performance when only the last value is needed.

For those cases, some alternate implementations may be available. Check the actual indicators for available functions.
