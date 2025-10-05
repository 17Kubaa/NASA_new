
          // calcRating.js
          // Calculating a rating from list of parameters and activity type the user is interested in
          // Supports an array of parameter objects (e.g. [{name, value}, ...])
          // or a plain object map ({ wind_speed_10m: 5, t_2m: 20, ... }).

          function calcRating(parameters, activity) {
            const paramMap = {};

            // Normalizing input into a key-value map
            if (Array.isArray(parameters)) {
              for (const p of parameters) {
                if (!p) continue;
                const name = p.name ?? p.parameter ?? p.key;
                const value = p.value ?? p.val ?? p.v ?? (p.hasOwnProperty('value') ? p.value : undefined);
                if (name !== undefined) paramMap[String(name)] = value;
              }
            } else if (parameters && typeof parameters === 'object') {
              for (const k of Object.keys(parameters)) paramMap[k] = parameters[k];
            }

            const get = (name, defaultValue = null) => {
              if (Object.prototype.hasOwnProperty.call(paramMap, name)) return paramMap[name];
              return defaultValue;
            };

            const num = (v, fallback = 0) => {
              const n = parseFloat(v);
              return Number.isFinite(n) ? n : fallback;
            };

            // let Rating be 2,5 initally, so it can reach 10 if all conditions are perfect
            let rating = 2.5;

            // Scoring Criteria based on weather parameters / what activity the user is seeking
            const wind = num(get('wind_speed_10m', get('wind_speed', 0)));
            rating += wind < 20 ? 2.5 : 1;

            const temp = num(get('t_2m', get('temperature', get('temp', 20))));
            rating += (temp < 30 && temp > 10) ? 2.5 : 1;

            const precip = num(get('precip_1m', get('precipitation', 0)));
            rating += (precip > 7.5) ? -1 : 2.5;

            const tstorm = num(get('tstorm_warning', 0));
            if (activity === 'hiking trails' && tstorm > 1) rating -= 5;
            const wave = num(get('wave_height', 0));
            if (activity === 'beaches' &&  wave > 1) rating -= 2;
            const frost = num(get('frost_warning', 0));
            if (activity === "ski resorts" && frost >= 1) rating -= 3;
            const current = num(get('ocean_current_speed', 0));
            if (activity === 'fishing' && current > 1.5) rating -=2;

            // Depending on rating value, the function returns a string (and hopefully a rating bar showing the same)
            if (rating < 0) return 'Not Recommended - Be Safe!';
            if (rating < 3) return 'Poor';
            if (rating < 6) return 'Fair';
            if (rating < 8) return 'Good';
            return 'Excellent';
          }

            // export file in Node.js (for testing)
            if (typeof module !== 'undefined' && module.exports) module.exports = calcRating;
        
        
