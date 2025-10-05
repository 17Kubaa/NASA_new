import numpy as np
from sklearn.model_selection import train_test_split
# regularized polynomial regression
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
# gaussian process regression
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel as C
# js interaction
from flask import Flask, jsonify, request
from flask_cors import CORS

csv_file = "weather_extract.csv"

# for now let me assume that the format is correct, dates are given as year col, month col, day col
# weather_nd = np.loadtxt(csv_file, delimiter=',',)

# simulated data
N = len(weather_nd)
D = len(weather_nd[0])
SEED = 42

np.random.seed(SEED)
X = np.random.rand(N, D) * 10 # 250 points, 6 features, values bw 0-10

# define target y with a non-linear comp (d1^2, d2*d3) and noise
y = (
    2.5 * X[:, 0]  # Linear term (D1)
    + 0.5 * X[:, 1]**2  # Quadratic term (D2^2)
    + 1.0 * X[:, 2] * X[:, 3]  # Interaction term (D3*D4)
    - 5 * X[:, 5]  # Another linear term (D6)
    + 3.0 * np.sin(X[:, 4])  # Sinusoidal term (D5)
    + 5 * np.random.randn(N)  # Add Gaussian noise
)

# Separate into training and testing sets (optional but good practice)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=SEED)
print(f"Training data shape: {X_train.shape}, Test data shape: {X_test.shape}")

# OPTION A: regularized polynomial regression

# 1. Define the complexity: Polynomial degree
# Degree 2 is often a good starting point for small, high-dimensional data.
poly_degree = 2

# 2. Create the pipeline: Polynomial features -> Scaling -> Ridge Regression
ridge_pipeline = Pipeline([
    ('poly', PolynomialFeatures(degree=poly_degree, include_bias=False)),
    ('scaler', StandardScaler()),
    ('ridge', Ridge(alpha=1.0)) # alpha is the regularization strength
])

# 3. Fit the model to the training data
ridge_pipeline.fit(X_train, y_train)

# --- Extract Parameters for Real-Time Use ---

# The real-time "plane" (surface) is defined by these coefficients and the intercept.
# They are the core parameters that define your prediction model.
ridge_coefficients = ridge_pipeline.named_steps['ridge'].coef_
ridge_intercept = ridge_pipeline.named_steps['ridge'].intercept_
feature_names = ridge_pipeline.named_steps['poly'].get_feature_names_out(input_features=[f'X{i+1}' for i in range(D)])

print("\n--- Method 1: Ridge Regression Parameters ---")
print(f"Polynomial Degree: {poly_degree}")
print(f"Number of Features after transformation: {len(feature_names)}")
print(f"Intercept (b): {ridge_intercept:.4f}")
print(f"Top 5 Coefficients: {ridge_coefficients[:5]}")

def predict_ridge_realtime(new_X_point, pipeline):
    # predict output (y) for a single new datapoint using the pre-fitted pipeline
    return pipeline.predict(new_X_point.reshape(1, -1))[0]

new_point = np.array([5.0, 5.0, 5.0, 5.0, 5.0, 5.0])
prediction_ridge = predict_ridge_realtime(new_point, ridge_pipeline)
print(f"\nReal-Time Ridge Prediction for {new_point}: {prediction_ridge:.4f}")

# OPTION B: 
# 1. Define the kernel (the assumption of smoothness/shape)
# RBF (Radial-Basis Function) is a common choice.
# The kernel hyperparameters (length_scale, C) will be optimized during fitting.
kernel = C(1.0, (1e-3, 1e3)) * RBF(1.0, (1e-2, 1e2))

# 2. Create the GPR model
# 'n_restarts_optimizer' helps find better hyperparameters
gpr = GaussianProcessRegressor(
    kernel=kernel, 
    alpha=1e-5,  # Noise level
    n_restarts_optimizer=10, 
    random_state=SEED
)

# 3. Fit the model
gpr.fit(X_train, y_train)

# --- Extract Parameters for Real-Time Use ---

# GPR prediction requires the fitted kernel AND the original training data.
gpr_kernel = gpr.kernel_
gpr_X_train = gpr.X_train_
gpr_y_train = gpr.y_train_
gpr_alpha = gpr.alpha

print("\n--- Method 2: Gaussian Process Regression Parameters ---")
print(f"Optimized Kernel: {gpr_kernel}")
print(f"Optimal $\\text{{length\_scale}}$: {gpr_kernel.get_params()['k2__length_scale']:.4f}")
print(f"Optimal $\\text{{Constant Kernel (C)}}$: {gpr_kernel.get_params()['k1__constant_value']:.4f}")
print(f"Training Data Stored for Prediction: X_train (shape {gpr_X_train.shape})")

def predict_gpr_realtime(new_X_point, model):
    """
    Predicts the output (y) and its uncertainty for a single new data point.
    """
    # Prediction returns the mean and standard deviation (sigma) of the prediction
    mean_prediction, std_dev = model.predict(
        new_X_point.reshape(1, -1), 
        return_std=True
    )
    return mean_prediction[0], std_dev[0]

# Example real-time prediction
new_point = np.array([5.0, 5.0, 5.0, 5.0, 5.0, 5.0]) 
prediction_gpr, uncertainty = predict_gpr_realtime(new_point, gpr)

print(f"\nReal-Time GPR Prediction for {new_point}: {prediction_gpr:.4f}")
print(f"Prediction Uncertainty (Std Dev): {uncertainty:.4f}")
